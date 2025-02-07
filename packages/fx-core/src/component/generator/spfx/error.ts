// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { SystemError, UserError } from "@microsoft/teamsfx-api";
import { Constants } from "./utils/constants";
import { getDefaultString, getLocalizedString } from "../../../common/localizeUtils";

export function ScaffoldError(error: Error): UserError | SystemError {
  if (error instanceof UserError || error instanceof SystemError) {
    return error;
  } else {
    return new SystemError({
      error: error,
      source: Constants.PLUGIN_NAME,
      name: "SPFxScaffoldError",
    });
  }
}

export function NpmInstallError(error: Error): SystemError {
  return new SystemError(
    Constants.PLUGIN_NAME,
    "NpmInstallFailed",
    getDefaultString("plugins.spfx.error.npmInstallFailed", error.message),
    getLocalizedString("plugins.spfx.error.npmInstallFailed", error.message)
  );
}

export function DependencyValidateError(dependency: string): SystemError {
  return new SystemError(
    Constants.PLUGIN_NAME,
    "InvalidDependency",
    getDefaultString("plugins.spfx.error.invalidDependency", dependency),
    getLocalizedString("plugins.spfx.error.invalidDependency", dependency)
  );
}

export function DevEnvironmentSetupError(): UserError {
  return new UserError({
    source: Constants.PLUGIN_NAME,
    name: "DevEnvironmentSetupError",
    message: getDefaultString("plugins.spfx.error.devEnvironmentNotSetup"),
    displayMessage: getLocalizedString("plugins.spfx.error.devEnvironmentNotSetup"),
    helpLink: Constants.SetUpDevEnvironmentHelpLink,
  });
}

export function LatestPackageInstallError(): SystemError {
  const fxFolderPath = "HOME/.fx";
  return new SystemError(
    Constants.PLUGIN_NAME,
    "LatestPackageInstallFailed",
    getDefaultString(
      "plugins.spfx.error.installLatestDependencyError",
      fxFolderPath,
      Constants.SetUpDevEnvironmentHelpLink
    ),
    getLocalizedString(
      "plugins.spfx.error.installLatestDependencyError",
      fxFolderPath,
      Constants.SetUpDevEnvironmentHelpLink
    )
  );
}

export function YoGeneratorScaffoldError(): UserError {
  return new UserError({
    source: Constants.PLUGIN_NAME,
    name: "ScaffoldFailed",
    message: getDefaultString(
      "plugins.spfx.error.scaffoldError",
      "command:fx-extension.showOutputChannel"
    ),
    displayMessage: getLocalizedString(
      "plugins.spfx.error.scaffoldError",
      "command:fx-extension.showOutputChannel"
    ),
    helpLink: Constants.ScaffoldHelpLink,
  });
}
