import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { PanelProps } from '@grafana/data';
import { css, cx } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import html2canvas from 'html2canvas';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiAnalyzerOptions } from '../types';

interface Props extends PanelProps<GeminiAnalyzerOptions> {}

// Rate limiting implementation 
class RateLimiter {
  private lastCallTime: number = 0;
  private callsInWindow: number = 0;
  private windowStartTime: number = 0;
  
  constructor(
    private maxCallsPerMinute: number = 10,
    private minTimeBetweenCalls: number = 2000 // 2 seconds
  ) {
    this.windowStartTime = Date.now();
  }

  canMakeCall(): boolean {
    const now = Date.now();
    
    // Reset window counter if a minute has passed
    if (now - this.windowStartTime > 60000) {
      this.callsInWindow = 0;
      this.windowStartTime = now;
    }
    
    // Check if we're under rate limits
    const timeSinceLastCall = now - this.lastCallTime;
    return this.callsInWindow < this.maxCallsPerMinute && 
           timeSinceLastCall >= this.minTimeBetweenCalls;
  }

  recordCall(): void {
    this.lastCallTime = Date.now();
    this.callsInWindow++;
  }

  getTimeUntilNextCallAllowed(): number {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    if (this.callsInWindow >= this.maxCallsPerMinute) {
      // Need to wait until the window resets
      return this.windowStartTime + 60000 - now;
    } else if (timeSinceLastCall < this.minTimeBetweenCalls) {
      // Need to wait until min time between calls
      return this.minTimeBetweenCalls - timeSinceLastCall;
    }
    
    return 0; // Can make call now
  }
}

const getStyles = () => {
  return {
    wrapper: css`
      display: flex;
      flex-direction: column;
    `,
    options: css`
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      gap: 10px;
    `,
    selectInput: css`
      max-width: 130px;
    `,
    checkbox: css`
      margin-right: 10px;
    `,
    outputText: css`
      width: 100%;
      flex: 1;
      overflow-y: auto;

      h3 {
        font-size: 1em;
      }

      ul {
        margin-bottom: 10px;
      }
    `,
    limitInfo: css`
      font-size: 0.8em;
      color: #999;
      margin-top: 5px;
    `,
    panel: css`
      /* Add any panel-specific styles here */
    `,
  };
};

const analysisOptions: { [key: string]: string } = {
  Summary: `This image shows a Grafana Dashboard. Only focus on the panels on the dashboard. DO NOT INCLUDE the Gemini Analyser panel in your analysis. Provide a brief summary of what the dashboard is displaying, focusing on the most critical and relevant data points. Always start with "This dashboard shows..." and ensure that the summary captures the key insights without going into too much detail.`,
  Insights: `This image shows a Grafana Dashboard. Only focus on the panels on the dashboard. DO NOT INCLUDE the Gemini Analyser panel in your analysis. Please explain what the data is showing and share any insights you can gather from it. Always start with "This dashboard shows..." and provide detailed insights into the data presented, highlighting any trends, patterns, or anomalies you observe.`,
  Accessibility: `This image shows a Grafana Dashboard. Only focus on the panels on the dashboard. DO NOT INCLUDE the Gemini Analyser panel in your analysis. Please explain what the data is showing in great detail, aiming to provide a clear description for users who may be visually impaired. Describe each panel's content and structure comprehensively. Always start with "This dashboard shows..." and ensure that all aspects of the data are explained in a way that is accessible to all users.`,
  Diagnosis: `This image shows a Grafana Dashboard. Only focus on the panels on the dashboard. DO NOT INCLUDE the Gemini Analyser panel in your analysis. Please analyze the data for any potential issues or problems, highlighting correlations and any critical points of concern. Always start with "This dashboard shows..." and provide a detailed diagnosis of any potential issues or inefficiencies indicated by the data.`,
  Comparison: `This image shows a Grafana Dashboard. Only focus on the panels on the dashboard. DO NOT INCLUDE the Gemini Analyser panel in your analysis. Compare the data across different panels to highlight any correlations, discrepancies, or significant differences. Always start with "This dashboard shows..." and provide a comparative analysis, explaining how the data in various panels relate to each other.`,
  Forecasting: `This image shows a Grafana Dashboard. Only focus on the panels on the dashboard. DO NOT INCLUDE the Gemini Analyser panel in your analysis. Based on the current data, provide a forecast of future trends and usage patterns. Always start with "This dashboard shows..." and offer insights into what future data might look like, explaining the basis of your forecasts.`
};

export const GeminiAnalyzerPanel: React.FC<Props> = ({ options, data, width, height }) => {
  const styles = useStyles2(getStyles);
  const [buttonText, setButtonText] = useState('Analyse');
  const [buttonEnabled, setButtonEnabled] = useState(true);
  const [analysisText, setAnalysisText] = useState('Please choose an analysis option and click Analyse.');
  const [selectedOption, setSelectedOption] = useState('Summary');
  const [prompt, setPrompt] = useState(analysisOptions.Summary);
  const [rateInfo, setRateInfo] = useState('');
  
  // Create a rate limiter
  const rateLimiterRef = useRef(new RateLimiter(
    options.maxCallsPerMinute || 10,
    options.minTimeBetweenCalls || 2000
  ));

  // Update rate limiter when options change
  useEffect(() => {
    rateLimiterRef.current = new RateLimiter(
      options.maxCallsPerMinute || 10,
      options.minTimeBetweenCalls || 2000
    );
  }, [options.maxCallsPerMinute, options.minTimeBetweenCalls]);

  const handleOptionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = event.target.value;
    setSelectedOption(selected);
    setPrompt(analysisOptions[selected]);
  };

  const analyzeWithGemini = async (screenshot: string, promptText: string) => {
    try {
      if (!options.apiKey) {
        return "Error: Gemini API Key is not configured. Please add your API key in the panel options.";
      }

      // Use gemini-1.5-flash as default if no model is specified
      const modelToUse = options.model || "gemini-1.5-flash";
      
      const genAI = new GoogleGenerativeAI(options.apiKey);
      const model = genAI.getGenerativeModel({
        model: modelToUse,
      });

      // Log which model is being used (helpful for debugging)
      console.log(`Using Gemini model: ${modelToUse}`);

      const result = await model.generateContent([
        promptText,
        {
          inlineData: {
            data: screenshot.split(',')[1],
            mimeType: "image/png"
          }
        }
      ]);

      return result.response.text();
    } catch (error) {
      console.error("Gemini API error:", error);
      if (String(error).includes("deprecated")) {
        return `Error: The specified Gemini model has been deprecated. Please update your panel configuration to use "gemini-1.5-flash" or "gemini-1.5-pro" instead.`;
      }
      return `Error analyzing dashboard: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  const onButtonClick = async () => {
    // Check rate limits
    if (!rateLimiterRef.current.canMakeCall()) {
      const waitTime = rateLimiterRef.current.getTimeUntilNextCallAllowed();
      const waitSeconds = Math.ceil(waitTime / 1000);
      setRateInfo(`Rate limit reached. Please wait ${waitSeconds} seconds before trying again.`);
      return;
    }

    try {
      setButtonText('Analysing...');
      setButtonEnabled(false);
      setRateInfo('');

      // Record this API call for rate limiting
      rateLimiterRef.current.recordCall();

      // Take a screenshot of the dashboard
      const canvas = await html2canvas(document.body, { 
        useCORS: true, 
        logging: false,
        ignoreElements: (element: HTMLElement) => {
          // Try to exclude this panel itself from the screenshot
          return element.id === `panel-${options.panelId}` || 
                 element.classList.contains('gemini-analyzer-panel');
        }
      });

      const dataUrl = canvas.toDataURL("image/png");
      
      // Send to Gemini for analysis
      const response = await analyzeWithGemini(dataUrl, prompt);
      setAnalysisText(response);

    } catch (err) {
      console.error(err);
      setAnalysisText(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setButtonText('Analyse');
      setButtonEnabled(true);
    }
  };

  return (
    <div 
      className={cx(styles.wrapper, styles.panel, "gemini-analyzer-panel", css`
        width: ${width}px;
        height: ${height}px;
      `)}
      id={`panel-${options.panelId}`}
      data-testid="gemini-analyzer-panel"
    >
      <div className={cx(styles.options)}>
        <select 
          id="analysisType" 
          value={selectedOption} 
          onChange={handleOptionChange} 
          className={cx(styles.selectInput)}
        >
          {Object.keys(analysisOptions).map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <button onClick={onButtonClick} disabled={!buttonEnabled}>{buttonText}</button>
      </div>
      {rateInfo && <div className={cx(styles.limitInfo)}>{rateInfo}</div>}
      {analysisText && <ReactMarkdown className={cx(styles.outputText)}>
        {analysisText}
      </ReactMarkdown>}
    </div>
  );
};