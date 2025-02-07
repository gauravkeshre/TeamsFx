import {
  AzureSolutionSettings,
  Json,
  ProjectSettings,
  ProjectSettingsV3,
} from "@microsoft/teamsfx-api";
import { pathExistsSync } from "fs-extra";
import { cloneDeep } from "lodash";
import { join } from "path";
import { isVSProject } from "../common/projectSettingsHelper";
import { ComponentNames, MessageExtensionNewUIItem } from "./constants";
import { ensureComponentConnections } from "./utils";
import { getComponent } from "./workflow";

export interface EnvStateV2 {
  solution: {
    teamsAppTenantId?: string;
    subscriptionId?: string;
    subscriptionName?: string;
    tenantId?: string;
    needCreateResourceGroup?: boolean;
    resourceGroupName?: string;
    location?: string;
    resourceNameSuffix?: string;
    provisionSucceeded?: boolean;
  };
  "fx-resource-appstudio"?: {
    tenantId?: string;
    teamsAppId?: string;
    teamsAppUpdatedAt?: number;
  };
  "fx-resource-identity"?: {
    identityName?: string;
    identityResourceId?: string;
    identityClientId?: string;
  };
  "fx-resource-azure-sql"?: {
    admin?: string;
    adminPassword?: string;
    sqlResourceId?: string;
    sqlEndpoint?: string;
    databaseName?: string;
  };
  "fx-resource-bot"?: {
    botId?: string;
    botPassword?: string;
    objectId?: string;
    skuName?: string;
    siteName?: string;
    validDomain?: string;
    appServicePlanName?: string;
    resourceId?: string;
    siteEndpoint?: string;
  };
  "fx-resource-aad-app-for-teams"?: {
    clientId?: string;
    clientSecret?: string;
    objectId?: string;
    oauth2PermissionScopeId?: string;
    tenantId?: string;
    oauthHost?: string;
    oauthAuthority?: string;
    applicationIdUris?: string;
    botId?: string;
    botEndpoint?: string;
    frontendEndpoint?: string;
  };
  "fx-resource-function"?: {
    functionAppResourceId?: string;
    functionEndpoint?: string;
  };
  "fx-resource-apim"?: {
    apimClientAADObjectId?: string;
    apimClientAADClientId?: string;
    apimClientAADClientSecret?: string;
    serviceResourceId?: string;
    productResourceId?: string;
    authServerResourceId?: string;
  };
  "fx-resource-frontend-hosting"?: {
    domain?: string;
    endpoint?: string;
    indexPath?: string;
    storageResourceId?: string;
  };
  "fx-resource-key-vault"?: {
    keyVaultResourceId?: string;
    m365ClientSecretReference?: string;
    botClientSecretReference?: string;
  };
}

export const EnvStateMigrationComponentNames = [
  ["solution", "solution"],
  ["fx-resource-appstudio", ComponentNames.AppManifest],
  ["fx-resource-identity", ComponentNames.Identity],
  ["fx-resource-azure-sql", ComponentNames.AzureSQL],
  ["fx-resource-aad-app-for-teams", ComponentNames.AadApp],
  ["fx-resource-function", ComponentNames.TeamsApi],
  ["fx-resource-apim", ComponentNames.APIM],
  ["fx-resource-key-vault", ComponentNames.KeyVault],
  ["fx-resource-bot", ComponentNames.TeamsBot],
  ["fx-resource-frontend-hosting", ComponentNames.TeamsTab],
  ["fx-resource-simple-auth", ComponentNames.SimpleAuth],
];

export const APIM_STATE_KEY = ComponentNames.APIM;
export const API_STATE_KEY = ComponentNames.TeamsApi;
export const AAD_STATE_KEY = ComponentNames.AadApp;
export const TAB_STATE_KEY = ComponentNames.TeamsTab;
export const BOT_STATE_KEY = ComponentNames.TeamsBot;
export const SIMPLE_AUTH_STATE_KEY = ComponentNames.SimpleAuth;
export const APP_MANIFEST_KEY = ComponentNames.AppManifest;

/**
 * convert envState from V3 to V2
 */
export function convertEnvStateV3ToV2(envStateV3: Json): EnvStateV2 {
  const envStateV2: Json = {};
  const component2plugin = new Map<string, string>();
  EnvStateMigrationComponentNames.forEach((e) => {
    component2plugin.set(e[1], e[0]);
  });
  for (const componentName of Object.keys(envStateV3)) {
    const pluginName = component2plugin.get(componentName);
    if (pluginName) {
      envStateV2[pluginName] = envStateV3[componentName];
    }
  }
  return envStateV2 as EnvStateV2;
}

/**
 * convert envState from V2 to V3
 */
export function convertEnvStateV2ToV3(envStateV2: Json): Json {
  const envStateV3: Json = {};
  const plugin2component = new Map<string, string>();
  EnvStateMigrationComponentNames.forEach((e) => {
    plugin2component.set(e[0], e[1]);
  });
  for (const pluginName of Object.keys(envStateV2)) {
    const componentName = plugin2component.get(pluginName);
    if (componentName) {
      envStateV3[componentName] = envStateV2[pluginName];
    }
  }
  return envStateV3;
}

export function convertProjectSettingsV2ToV3(
  settingsV2: ProjectSettings,
  projectPath: string
): ProjectSettingsV3 {
  const settingsV3 = cloneDeep(settingsV2) as ProjectSettingsV3;
  const solutionSettings = settingsV2.solutionSettings as AzureSolutionSettings;
  if (solutionSettings && (!settingsV3.components || settingsV3.components.length === 0)) {
    settingsV3.components = [];
    const isVS = isVSProject(settingsV2);
    const hasAAD = solutionSettings.activeResourcePlugins.includes("fx-resource-aad-app-for-teams");
    if (hasAAD) {
      settingsV3.components.push({
        name: ComponentNames.AadApp,
        provision: true,
        deploy: true,
      });
    }
    if (solutionSettings.activeResourcePlugins.includes("fx-resource-frontend-hosting")) {
      const hostingComponent = isVS ? ComponentNames.AzureWebApp : ComponentNames.AzureStorage;
      const existsAuthStartFile = pathExistsSync(
        join(projectPath, "tabs", "public", "auth-start.html")
      );
      const tabSSO =
        solutionSettings.capabilities.includes("TabSSO") ||
        solutionSettings.capabilities.includes("SSO") ||
        existsAuthStartFile;
      if (isVS) {
        const teamsTab: any = {
          hosting: hostingComponent,
          name: "teams-tab",
          build: true,
          provision: true,
          folder: "",
          artifactFolder: "bin\\Release\\net6.0\\win-x86\\publish",
          sso: tabSSO,
          deploy: true,
        };
        settingsV3.components.push(teamsTab);
      } else {
        const teamsTab: any = {
          hosting: hostingComponent,
          name: "teams-tab",
          build: true,
          provision: true,
          folder: "tabs",
          sso: tabSSO,
          deploy: true,
        };
        settingsV3.components.push(teamsTab);
      }
      const hostingConfig = getComponent(settingsV3, hostingComponent);
      if (hostingConfig) {
        hostingConfig.connections = hostingConfig.connections || [];
        hostingConfig.connections.push("teams-tab");
      } else {
        settingsV3.components.push({
          name: hostingComponent,
          connections: ["teams-tab"],
          provision: true,
        });
      }
    }
    if (solutionSettings.activeResourcePlugins.includes("fx-resource-spfx")) {
      const teamsTab: any = {
        hosting: "spfx",
        name: "teams-tab",
        build: true,
        provision: true,
        folder: "SPFx",
        deploy: true,
      };
      settingsV3.components.push(teamsTab);
      settingsV3.components.push({
        name: "spfx",
        provision: true,
      });
    }
    if (solutionSettings.activeResourcePlugins.includes("fx-resource-bot")) {
      const hostType = settingsV2.pluginSettings?.["fx-resource-bot"]?.["host-type"];
      let botCapabilities = settingsV2.pluginSettings?.["fx-resource-bot"]?.["capabilities"];
      if (
        solutionSettings.capabilities.includes(MessageExtensionNewUIItem().id) &&
        !botCapabilities?.includes("message-extension")
      ) {
        botCapabilities = botCapabilities || [];
        botCapabilities.push("message-extension");
      }
      const isHostingFunction = hostType === "azure-functions";
      const hostingComponent = isHostingFunction
        ? ComponentNames.Function
        : ComponentNames.AzureWebApp;
      if (isVS) {
        const teamsBot: any = {
          name: "teams-bot",
          hosting: hostingComponent,
          build: true,
          provision: true,
          folder: "",
          artifactFolder: "bin\\Release\\net6.0\\win-x86\\publish",
          capabilities: botCapabilities,
          sso: solutionSettings.capabilities.includes("BotSSO"),
          deploy: true,
        };
        settingsV3.components.push(teamsBot);
      } else {
        const teamsBot: any = {
          hosting: hostingComponent,
          name: "teams-bot",
          build: true,
          provision: true,
          folder: "bot",
          capabilities: botCapabilities,
          sso: solutionSettings.capabilities.includes("BotSSO"),
          deploy: true,
        };
        settingsV3.components.push(teamsBot);
      }
      const hostingConfig = getComponent(settingsV3, hostingComponent);
      if (hostingConfig) {
        hostingConfig.connections = hostingConfig.connections || [];
        hostingConfig.connections.push("teams-bot");
      } else {
        settingsV3.components.push({
          name: hostingComponent,
          connections: ["teams-bot"],
          provision: true,
          scenario: "Bot",
        });
      }
      settingsV3.components.push({
        name: ComponentNames.BotService,
        provision: true,
      });
    }
    if (solutionSettings.activeResourcePlugins.includes("fx-resource-identity")) {
      settingsV3.components.push({
        name: ComponentNames.Identity,
      });
    }
    if (solutionSettings.activeResourcePlugins.includes("fx-resource-key-vault")) {
      settingsV3.components.push({
        name: ComponentNames.KeyVault,
      });
    }
    if (solutionSettings.activeResourcePlugins.includes("fx-resource-azure-sql")) {
      settingsV3.components.push({
        name: ComponentNames.AzureSQL,
        provision: true,
      });
    }
    if (solutionSettings.activeResourcePlugins.includes("fx-resource-apim")) {
      settingsV3.components.push({
        name: ComponentNames.APIM,
        provision: true,
        deploy: true,
      });
    }
    if (solutionSettings.activeResourcePlugins.includes("fx-resource-simple-auth")) {
      settingsV3.components.push({
        name: ComponentNames.SimpleAuth,
        provision: true,
      });
    }
    if (solutionSettings.activeResourcePlugins.includes("fx-resource-function")) {
      settingsV3.components.push({
        name: ComponentNames.TeamsApi,
        hosting: ComponentNames.Function,
        functionNames: [settingsV2.defaultFunctionName || "getUserProfile"],
        build: true,
        folder: "api",
        deploy: true,
        artifactFolder: "api",
      });
      settingsV3.components.push({
        name: ComponentNames.Function,
        scenario: "Api",
      });
    }

    ensureComponentConnections(settingsV3);
  }
  return settingsV3;
}

export function convertManifestTemplateToV3(content: string): string {
  for (const pluginAndComponentArray of EnvStateMigrationComponentNames) {
    const pluginName = pluginAndComponentArray[0];
    const componentName = pluginAndComponentArray[1];
    if (pluginName !== componentName)
      content = content.replace(new RegExp(`state.${pluginName}`, "g"), `state.${componentName}`);
  }
  return content;
}

export function convertManifestTemplateToV2(content: string): string {
  for (const pluginAndComponentArray of EnvStateMigrationComponentNames) {
    const pluginName = pluginAndComponentArray[0];
    const componentName = pluginAndComponentArray[1];
    if (pluginName !== componentName)
      content = content.replace(new RegExp(`state.${componentName}`, "g"), `state.${pluginName}`);
  }
  return content;
}
