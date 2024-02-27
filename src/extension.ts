import vscode from 'vscode';
import * as cp from 'child_process';
import type { ArduinoContext, ArduinoState } from 'vscode-arduino-api';
import { debugOutput, createDebugOutput, opeTerminal } from './terminal';
import { decode } from './decoder';
import {
  mockArduinoContext,
  mockArduinoState,
  mockBoardDetails,
  mockCompileSummary,
} from './test/suite/mock';

async function getArduinoConfigUri(workspaceUri: vscode.Uri) {
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceUri, '**/arduino.json')
  );

  if (files.length === 0) {
    return;
  }

  return files[0];
}

type ArduinoConfig = {
  output?: string;
  sketch?: string;
  board?: string;
  programmer?: string;
};

async function getWorkspaceJsonFile<T>(uri: vscode.Uri) {
  const doc = (await vscode.workspace.openTextDocument(uri)).getText();
  return JSON.parse(doc) as T;
}

const execShell = (cmd: string) =>
  new Promise<string>((resolve, reject) => {
    cp.exec(cmd, (err, out) => {
      if (err) {
        return reject(err);
      }
      return resolve(out);
    });
  });

async function getArduinoState(): Promise<ArduinoState | undefined> {
  const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;

  if (!workspaceUri) {
    return;
  }

  const arduinoConfigUri = await getArduinoConfigUri(workspaceUri);
  if (!arduinoConfigUri) {
    vscode.window.showErrorMessage('could not find arduino.json');
    return;
  }

  const arduinoConfig = await getWorkspaceJsonFile<ArduinoConfig>(
    arduinoConfigUri
  );

  const sketchPath = vscode.Uri.joinPath(workspaceUri).fsPath;

  if (!arduinoConfig.output) {
    vscode.window.showErrorMessage('no arduino.json output directory');
    return;
  }
  const buildPath = vscode.Uri.joinPath(
    workspaceUri,
    arduinoConfig.output
  ).fsPath;

  const fqbn = arduinoConfig.board || 'esp8266:esp8266:nodemcuv2';

  // parse buildProperties so it is split on \n and then on = to get key value pairs
  const buildProperties = await execShell(
    `arduino-cli board details -b ${fqbn} --show-properties=expanded`
  )
    .then((out) => out.split('\n').map((line) => line.split('=')))
    .then((lines) => Object.fromEntries(lines));

  return mockArduinoState({
    fqbn,
    compileSummary: mockCompileSummary(buildPath),
    boardDetails: mockBoardDetails(fqbn, buildProperties),
    sketchPath: sketchPath,
  });
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    new vscode.Disposable(() => debugOutput()?.dispose()),
    vscode.commands.registerCommand(
      'espExceptionDecoder.showTerminal',
      async () => {
        const state = await getArduinoState();
        if (!state) {
          vscode.window.showErrorMessage('failed to get arduino state');
          return;
        }
        const context = mockArduinoContext(state);

        opeTerminal(context, decode, {
          show: true,
          debug: createDebugOutput(),
        });
      }
    )
  );
}

async function findArduinoContext(): Promise<ArduinoContext | undefined> {
  const apiExtension = findArduinoApiExtension();
  if (apiExtension && !apiExtension.isActive) {
    await apiExtension.activate();
  }
  return apiExtension?.exports;
}

const vscodeArduinoAPI = 'dankeboy36.vscode-arduino-api';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findArduinoApiExtension(): vscode.Extension<any> | undefined {
  return vscode.extensions.getExtension(vscodeArduinoAPI);
}
