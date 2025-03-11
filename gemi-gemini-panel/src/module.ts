import { PanelPlugin } from '@grafana/data';
import { GeminiAnalyzerOptions } from './types';
import { GeminiAnalyzerPanel } from '../src/components/SimplePanel';

export const plugin = new PanelPlugin<GeminiAnalyzerOptions>(GeminiAnalyzerPanel)
  .setPanelOptions(builder => {
    return builder
      .addTextInput({
        path: 'apiKey',
        name: 'Gemini API Key',
        description: 'Your Google API key for Gemini',
        defaultValue: '',
        settings: {
          placeholder: 'Enter your API key',
          secure: true,
        },
      })
      .addSelect({
        path: 'model',
        name: 'Gemini Model',
        description: 'Which Gemini model to use',
        defaultValue: 'gemini-1.5-flash',
        settings: {
          options: [
            { value: 'gemini-1.5-flash', label: 'Gemini Flash' },
          ],
        },
      })
      .addNumberInput({
        path: 'maxCallsPerMinute',
        name: 'Max Calls Per Minute',
        description: 'Maximum number of API calls allowed per minute',
        defaultValue: 10,
      })
      .addNumberInput({
        path: 'minTimeBetweenCalls',
        name: 'Min Time Between Calls (ms)',
        description: 'Minimum time between API calls in milliseconds',
        defaultValue: 2000,
      })
      .addTextInput({
        path: 'panelId',
        name: 'Panel ID',
        description: 'ID of this panel (to exclude from screenshot)',
        defaultValue: '',
        settings: {
          placeholder: 'Auto-detected if left empty',
        },
      });
  });
