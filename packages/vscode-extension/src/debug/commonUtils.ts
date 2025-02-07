// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import * as path from "path";
import * as uuid from "uuid";
import { Stage, UserError } from "@microsoft/teamsfx-api";
import VsCodeLogInstance from "../commonlib/log";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import { core, getSystemInputs } from "../handlers";
import * as globalVariables from "../globalVariables";
import {
  LocalEnvManager,
  getProjectComponents as coreGetProjectComponents,
} from "@microsoft/teamsfx-core/build/common/local";
import { envUtil } from "@microsoft/teamsfx-core/build/component/utils/envUtil";
import { metadataUtil } from "@microsoft/teamsfx-core/build/component/utils/metadataUtil";
import { pathUtils } from "@microsoft/teamsfx-core/build/component/utils/pathUtils";
import { allRunningDebugSessions } from "./teamsfxTaskHandler";
import { ExtensionErrors, ExtensionSource } from "../error";
import { VS_CODE_UI } from "../extension";
import * as vscode from "vscode";

export async function getProjectRoot(
  folderPath: string,
  folderName: string
): Promise<string | undefined> {
  const projectRoot: string = path.join(folderPath, folderName);
  const projectExists: boolean = await fs.pathExists(projectRoot);
  return projectExists ? projectRoot : undefined;
}

export async function getNpmInstallLogInfo(): Promise<any> {
  const localEnvManager = new LocalEnvManager(VsCodeLogInstance, ExtTelemetry.reporter);
  return await localEnvManager.getNpmInstallLogInfo();
}

export class LocalDebugSession {
  static createSession() {
    const session = new LocalDebugSession(uuid.v4());
    return session;
  }
  static createInvalidSession() {
    return new LocalDebugSession();
  }

  readonly id: string;
  // Save the time when the event it sent for calculating time gaps.
  readonly eventTimes: { [eventName: string]: number | undefined } = {};
  readonly properties: { [key: string]: string } = {};
  readonly errorProps: string[] = [];
  readonly failedServices: { name: string; exitCode: number | undefined }[] = [];

  private constructor(id: string = DebugNoSessionId) {
    this.id = id;
  }
}

export const DebugNoSessionId = "no-session-id";
// Helper functions for local debug correlation-id, only used for telemetry
// Use a 2-element tuple to handle concurrent F5
const localDebugCorrelationIds: [LocalDebugSession, LocalDebugSession] = [
  LocalDebugSession.createInvalidSession(),
  LocalDebugSession.createInvalidSession(),
];
let current = 0;
export function startLocalDebugSession(): string {
  current = (current + 1) % 2;
  localDebugCorrelationIds[current] = LocalDebugSession.createSession();
  return getLocalDebugSessionId();
}

export function endLocalDebugSession() {
  localDebugCorrelationIds[current] = LocalDebugSession.createInvalidSession();
  current = (current + 1) % 2;
}

export function getLocalDebugSession(): LocalDebugSession {
  return localDebugCorrelationIds[current];
}

export function getLocalDebugSessionId(): string {
  return localDebugCorrelationIds[current].id;
}

export function checkAndSkipDebugging(): boolean {
  // skip debugging if there is already a debug session
  if (allRunningDebugSessions.size > 0) {
    VsCodeLogInstance.warning("Skip debugging because there is already a debug session.");
    endLocalDebugSession();
    return true;
  }
  return false;
}

// for telemetry use only
export async function getProjectComponents(): Promise<string | undefined> {
  const projectPath = globalVariables.workspaceUri!.fsPath;
  return coreGetProjectComponents(projectPath, VsCodeLogInstance, ExtTelemetry.reporter);
}

export class Step {
  private currentStep: number;
  public readonly totalSteps: number;
  constructor(totalSteps: number) {
    this.currentStep = 1;
    this.totalSteps = totalSteps;
  }

  getPrefix(): string {
    return `(${this.currentStep++}/${this.totalSteps})`;
  }
}

export async function getV3TeamsAppId(projectPath: string, env: string): Promise<string> {
  const result = await envUtil.readEnv(projectPath, env, false);
  if (result.isErr()) {
    throw result.error;
  }

  const teamsAppIdKey = (await getTeamsAppKeyName(env)) || "TEAMS_APP_ID";
  const teamsAppId = result.value[teamsAppIdKey];
  if (teamsAppId === undefined) {
    throw new UserError(
      ExtensionSource,
      ExtensionErrors.TeamsAppIdNotFoundError,
      `TEAMS_APP_ID is missing in ${env} environment.`
    );
  }

  return teamsAppId;
}

export async function getTeamsAppKeyName(env?: string): Promise<string | undefined> {
  const templatePath = pathUtils.getYmlFilePath(globalVariables.workspaceUri!.fsPath, env);
  const maybeProjectModel = await metadataUtil.parse(templatePath, env);
  if (maybeProjectModel.isErr()) {
    return undefined;
  }
  const projectModel = maybeProjectModel.value;
  if (projectModel.provision?.driverDefs && projectModel.provision.driverDefs.length > 0) {
    for (const driver of projectModel.provision.driverDefs) {
      if (driver.uses === "teamsApp/create") {
        return driver.writeToEnvironmentFile?.teamsAppId;
      }
    }
  }
  return undefined;
}

export async function triggerV3Migration(): Promise<void> {
  const inputs = getSystemInputs();
  inputs.stage = Stage.debug;
  const result = await core.phantomMigrationV3(inputs);
  if (result.isErr()) {
    await vscode.debug.stopDebugging();
    throw result.error;
  }
  // reload window to terminate debugging
  await VS_CODE_UI.reload();
}
