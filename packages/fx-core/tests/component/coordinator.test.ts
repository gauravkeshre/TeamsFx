import "mocha";

import { assert } from "chai";
import { DotenvParseOutput } from "dotenv";
import fs, { PathLike } from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import { Container } from "typedi";

import {
  err,
  FxError,
  Inputs,
  InputsWithProjectPath,
  IProgressHandler,
  LogProvider,
  ok,
  Platform,
  Result,
  SystemError,
  UserError,
  Void,
} from "@microsoft/teamsfx-api";

import { MetadataV3, VersionInfo, VersionSource } from "../../src/common/versionMetadata";
import {
  DriverInstance,
  ExecutionError,
  ExecutionOutput,
  ExecutionResult,
  ProjectModel,
} from "../../src/component/configManager/interface";
import {
  M365SsoLaunchPageOptionItem,
  NewProjectTypeOutlookAddinOptionItem,
  SolutionSource,
  TabNonSsoItem,
  TabOptionItem,
  TabSPFxItem,
} from "../../src/component/constants";
import { Coordinator, coordinator, TemplateNames } from "../../src/component/coordinator";
import { SummaryReporter } from "../../src/component/coordinator/summary";
import { deployUtils } from "../../src/component/deployUtils";
import { developerPortalScaffoldUtils } from "../../src/component/developerPortalScaffoldUtils";
import { DriverContext } from "../../src/component/driver/interface/commonArgs";
import { CreateAppPackageDriver } from "../../src/component/driver/teamsApp/createAppPackage";
import { ValidateManifestDriver } from "../../src/component/driver/teamsApp/validate";
import { ValidateAppPackageDriver } from "../../src/component/driver/teamsApp/validateAppPackage";
import { Generator } from "../../src/component/generator/generator";
import { OfficeAddinGenerator } from "../../src/component/generator/officeAddin/generator";
import { SPFxGenerator } from "../../src/component/generator/spfx/spfxGenerator";
import { provisionUtils } from "../../src/component/provisionUtils";
import * as appStudio from "../../src/component/resource/appManifest/appStudio";
import { AppDefinition } from "../../src/component/resource/appManifest/interfaces/appDefinition";
import { manifestUtils } from "../../src/component/resource/appManifest/utils/ManifestUtils";
import { createContextV3, createDriverContext } from "../../src/component/utils";
import { dotenvUtil, envUtil } from "../../src/component/utils/envUtil";
import { MetadataUtil } from "../../src/component/utils/metadataUtil";
import { pathUtils } from "../../src/component/utils/pathUtils";
import { resourceGroupHelper } from "../../src/component/utils/ResourceGroupHelper";
import { settingsUtil } from "../../src/component/utils/settingsUtil";
import * as coll from "../../src/core/collaborator";
import {
  checkPermissionFunc,
  FxCore,
  grantPermissionFunc,
  listCollaboratorFunc,
} from "../../src/core/FxCore";
import { FxCoreV3Implement } from "../../src/core/FxCoreImplementV3";
import { setTools } from "../../src/core/globalVars";
import * as v3MigrationUtils from "../../src/core/middleware/utils/v3MigrationUtils";
import {
  CoreQuestionNames,
  CreateNewOfficeAddinOption,
  ScratchOptionNo,
  ScratchOptionYes,
  ScratchOptionYesVSC,
} from "../../src/core/question";
import {
  InvalidAzureCredentialError,
  ResourceGroupConflictError,
  SelectSubscriptionError,
} from "../../src/error/azure";
import {
  InputValidationError,
  MissingEnvironmentVariablesError,
  MissingRequiredInputError,
  UserCancelError,
} from "../../src/error/common";
import {
  MockAzureAccountProvider,
  MockM365TokenProvider,
  MockTools,
  randomAppName,
} from "../core/utils";
import { MockedUserInteraction } from "../plugins/solution/util";

function mockedResolveDriverInstances(log: LogProvider): Result<DriverInstance[], FxError> {
  return ok([
    {
      uses: "arm/deploy",
      with: undefined,
      instance: {
        run: async (
          args: unknown,
          context: DriverContext
        ): Promise<Result<Map<string, string>, FxError>> => {
          return ok(new Map());
        },
      },
    },
  ]);
}

const versionInfo: VersionInfo = {
  version: MetadataV3.projectVersion,
  source: VersionSource.teamsapp,
};
const V3Version = MetadataV3.projectVersion;
describe("component coordinator test", () => {
  const sandbox = sinon.createSandbox();
  const tools = new MockTools();
  setTools(tools);
  afterEach(() => {
    sandbox.restore();
  });

  beforeEach(() => {
    sandbox.stub(v3MigrationUtils, "getProjectVersion").resolves(versionInfo);
  });

  it("create project from sample", async () => {
    sandbox.stub(Generator, "generateSample").resolves(ok(undefined));
    sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    const inputs: Inputs = {
      platform: Platform.CLI,
      folder: ".",
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionNo().id,
      [CoreQuestionNames.Samples]: "hello-world-tab",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.createProject(inputs);
    assert.isTrue(res.isOk());
  });

  it("fail to create project from sample", async () => {
    sandbox.stub(Generator, "generateSample").resolves(err(new UserError({})));
    sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    const inputs: Inputs = {
      platform: Platform.CLI,
      folder: ".",
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionNo().id,
      [CoreQuestionNames.Samples]: "hello-world-tab",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.createProject(inputs);
    assert.isTrue(res.isErr());
  });

  it("create project from sample rename folder", async () => {
    sandbox.stub(Generator, "generateSample").resolves(ok(undefined));
    sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    sandbox.stub(fs, "pathExists").onFirstCall().resolves(true).onSecondCall().resolves(false);
    sandbox
      .stub(fs, "readdir")
      .onFirstCall()
      .resolves(["abc"] as any)
      .onSecondCall()
      .resolves([]);
    const inputs: Inputs = {
      platform: Platform.CLI,
      folder: ".",
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionNo().id,
      [CoreQuestionNames.Samples]: "hello-world-tab",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.createProject(inputs);
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.isTrue(res.value.endsWith("_1"));
    }
  });
  it("create project from scratch", async () => {
    sandbox.stub(Generator, "generateSample").resolves(ok(undefined));
    sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionYes().id,
      [CoreQuestionNames.Capabilities]: [TabOptionItem().id],
      [CoreQuestionNames.ProgrammingLanguage]: "javascript",
    };
    const fxCore = new FxCore(tools);
    const res2 = await fxCore.createProject(inputs);
    assert.isTrue(res2.isOk());
  });
  it("create project from scratch MissingRequiredInputError missing folder", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      ignoreLockByUT: true,
    };
    const context = createContextV3();
    const res = await coordinator.create(context, inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof MissingRequiredInputError);
    }
  });
  it("create project from scratch MissingRequiredInputError missing App name", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      ignoreLockByUT: true,
      folder: ".",
    };
    const context = createContextV3();
    const res = await coordinator.create(context, inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof MissingRequiredInputError);
    }
  });
  it("create project from scratch MissingRequiredInputError invalid App name", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      ignoreLockByUT: true,
      folder: ".",
      "app-name": "__#$%___",
    };
    const context = createContextV3();
    const res = await coordinator.create(context, inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof InputValidationError);
    }
  });
  it("create project for new office Addin MissingRequiredInputError missing App name", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      ignoreLockByUT: true,
      folder: ".",
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionYesVSC().id,
      [CoreQuestionNames.ProjectType]: NewProjectTypeOutlookAddinOptionItem().id,
    };
    const context = createContextV3();
    const res = await coordinator.create(context, inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof MissingRequiredInputError);
    }
  });
  it("create project for new office Addin MissingRequiredInputError invalid App name", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      ignoreLockByUT: true,
      folder: ".",
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionYesVSC().id,
      [CoreQuestionNames.ProjectType]: NewProjectTypeOutlookAddinOptionItem().id,
      "app-name": "__#$%___",
    };
    const context = createContextV3();
    const res = await coordinator.create(context, inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof InputValidationError);
    }
  });
  it("create project from sample MissingRequiredInputError missing sample id", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      ignoreLockByUT: true,
      folder: ".",
      [CoreQuestionNames.CreateFromScratch]: "no",
    };
    const context = createContextV3();
    const res = await coordinator.create(context, inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof MissingRequiredInputError);
    }
  });
  it("create SPFx project", async () => {
    sandbox.stub(SPFxGenerator, "generate").resolves(err(new UserError({})));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionYes().id,
      [CoreQuestionNames.Capabilities]: TabSPFxItem().id,
      [CoreQuestionNames.ProgrammingLanguage]: "javascript",
      ["spfx-solution"]: "new",
      ["spfx-framework-type"]: "none",
      ["spfx-webpart-name"]: "test",
    };
    const fxCore = new FxCore(tools);
    const res2 = await fxCore.createProject(inputs);
    assert.isTrue(res2.isErr());
  });

  it("fail to create SPFx project", async () => {
    sandbox.stub(SPFxGenerator, "generate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionYes().id,
      [CoreQuestionNames.Capabilities]: TabSPFxItem().id,
      [CoreQuestionNames.ProgrammingLanguage]: "javascript",
      ["spfx-solution"]: "new",
      ["spfx-framework-type"]: "none",
      ["spfx-webpart-name"]: "test",
    };
    const fxCore = new FxCore(tools);
    const res2 = await fxCore.createProject(inputs);
    assert.isTrue(res2.isOk());
  });

  it("create project from VS", async () => {
    sandbox.stub(Generator, "generateSample").resolves(ok(undefined));
    sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    const inputs: Inputs = {
      platform: Platform.VS,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionYes().id,
      [CoreQuestionNames.Capabilities]: [TabOptionItem().id],
      [CoreQuestionNames.ProgrammingLanguage]: "csharp",
      [CoreQuestionNames.SafeProjectName]: "safeprojectname",
    };
    const fxCore = new FxCore(tools);
    const res2 = await fxCore.createProject(inputs);
    assert.isTrue(res2.isOk());
  });

  it("create m365 project from scratch", async () => {
    sandbox.stub(Generator, "generateSample").resolves(ok(undefined));
    sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionYes().id,
      [CoreQuestionNames.Capabilities]: M365SsoLaunchPageOptionItem().id,
      [CoreQuestionNames.ProgrammingLanguage]: "typescript",
    };
    const fxCore = new FxCore(tools);
    const res2 = await fxCore.createProject(inputs);
    assert.isTrue(res2.isOk());
    assert.isTrue(inputs.isM365);
  });

  it("create project for app with tab features from Developer Portal", async () => {
    sandbox.stub(fs, "ensureDir").resolves();
    const generator = sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    sandbox.stub(developerPortalScaffoldUtils, "updateFilesForTdp").resolves(ok(undefined));
    const appDefinition: AppDefinition = {
      teamsAppId: "mock-id",
      appId: "mock-id",
      staticTabs: [
        {
          name: "tab1",
          entityId: "tab1",
          contentUrl: "mock-contentUrl",
          websiteUrl: "mock-websiteUrl",
          context: [],
          scopes: [],
        },
      ],
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.ProgrammingLanguage]: "javascript",
      teamsAppFromTdp: appDefinition,
      [CoreQuestionNames.ReplaceWebsiteUrl]: ["tab1"],
      [CoreQuestionNames.ReplaceContentUrl]: [],
    };
    const fxCore = new FxCore(tools);
    const res2 = await fxCore.createProject(inputs);

    assert.isTrue(res2.isOk());
    assert.equal(generator.args[0][2], TemplateNames.Tab);
  });

  it("create project for app with bot feature from Developer Portal with updating files failed", async () => {
    sandbox.stub(fs, "ensureDir").resolves();
    const generator = sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    sandbox
      .stub(developerPortalScaffoldUtils, "updateFilesForTdp")
      .resolves(err(new UserError("coordinator", "error", "msg", "msg")));
    const appDefinition: AppDefinition = {
      teamsAppId: "mock-id",
      appId: "mock-id",
      bots: [
        {
          botId: "mock-bot-id",
          isNotificationOnly: false,
          needsChannelSelector: false,
          supportsCalling: false,
          supportsFiles: false,
          supportsVideo: false,
          scopes: [],
          teamCommands: [],
          groupChatCommands: [],
          personalCommands: [],
        },
      ],
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.ProgrammingLanguage]: "javascript",
      [CoreQuestionNames.ReplaceBotIds]: ["bot"],
      teamsAppFromTdp: appDefinition,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.createProject(inputs);

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "error");
    }
    assert.equal(generator.args[0][2], TemplateNames.DefaultBot);
  });

  it("create project for app with tab and bot features from Developer Portal", async () => {
    sandbox.stub(fs, "ensureDir").resolves();
    const generator = sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    sandbox.stub(developerPortalScaffoldUtils, "updateFilesForTdp").resolves(ok(undefined));
    const appDefinition: AppDefinition = {
      teamsAppId: "mock-id",
      appId: "mock-id",
      staticTabs: [
        {
          name: "tab1",
          entityId: "tab1",
          contentUrl: "mock-contentUrl",
          websiteUrl: "mock-websiteUrl",
          context: [],
          scopes: [],
        },
      ],
      bots: [
        {
          botId: "mock-bot-id",
          isNotificationOnly: false,
          needsChannelSelector: false,
          supportsCalling: false,
          supportsFiles: false,
          supportsVideo: false,
          scopes: [],
          teamCommands: [],
          groupChatCommands: [],
          personalCommands: [],
        },
      ],
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.ProgrammingLanguage]: "javascript",
      teamsAppFromTdp: appDefinition,
      [CoreQuestionNames.ReplaceWebsiteUrl]: ["tab1"],
      [CoreQuestionNames.ReplaceContentUrl]: [],
      [CoreQuestionNames.ReplaceBotIds]: ["bot"],
    };
    const fxCore = new FxCore(tools);
    const res2 = await fxCore.createProject(inputs);

    if (res2.isErr()) {
      console.log(res2.error);
    }
    assert.isTrue(res2.isOk());
    assert.isTrue(generator.calledOnce);
    assert.equal(generator.args[0][2], TemplateNames.TabAndDefaultBot);
  });

  it("create project for app with tab and message extension features from Developer Portal", async () => {
    sandbox.stub(fs, "ensureDir").resolves();
    const generator = sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    sandbox.stub(developerPortalScaffoldUtils, "updateFilesForTdp").resolves(ok(undefined));
    const appDefinition: AppDefinition = {
      teamsAppId: "mock-id",
      appId: "mock-id",
      staticTabs: [
        {
          name: "tab1",
          entityId: "tab1",
          contentUrl: "mock-contentUrl",
          websiteUrl: "mock-websiteUrl",
          context: [],
          scopes: [],
        },
      ],
      messagingExtensions: [
        {
          botId: "mock-bot-id",
          canUpdateConfiguration: false,
          commands: [],
          messageHandlers: [],
        },
      ],
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.ProgrammingLanguage]: "javascript",
      teamsAppFromTdp: appDefinition,
      [CoreQuestionNames.ReplaceWebsiteUrl]: ["tab1"],
      [CoreQuestionNames.ReplaceContentUrl]: [],
      [CoreQuestionNames.ReplaceBotIds]: ["bot"],
    };
    const fxCore = new FxCore(tools);
    const res2 = await fxCore.createProject(inputs);

    if (res2.isErr()) {
      console.log(res2.error);
    }
    assert.isTrue(res2.isOk());
    assert.isTrue(generator.calledOnce);
    assert.equal(generator.args[0][2], TemplateNames.TabAndDefaultBot);
  });

  it("create project for app with no features from Developer Portal - failed expecting inputs", async () => {
    sandbox.stub(fs, "ensureDir").resolves();
    sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    sandbox.stub(developerPortalScaffoldUtils, "updateFilesForTdp").resolves(ok(undefined));
    const appDefinition: AppDefinition = {
      teamsAppId: "mock-id",
      appId: "mock-id",
      staticTabs: [],
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.ProgrammingLanguage]: "javascript",
      teamsAppFromTdp: appDefinition,
    };
    const fxCore = new FxCore(tools);
    const res2 = await fxCore.createProject(inputs);

    assert.isTrue(res2.isErr());
  });

  it("create project for app from Developer Portal - not overwrite already set project type and capability", async () => {
    sandbox.stub(fs, "ensureDir").resolves();
    const generator = sandbox.stub(Generator, "generateTemplate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));
    sandbox.stub(developerPortalScaffoldUtils, "updateFilesForTdp").resolves(ok(undefined));
    const appDefinition: AppDefinition = {
      teamsAppId: "mock-id",
      appId: "mock-id",
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.ProgrammingLanguage]: "javascript",
      teamsAppFromTdp: appDefinition,
      [CoreQuestionNames.ReplaceWebsiteUrl]: ["tab1"],
      [CoreQuestionNames.ReplaceContentUrl]: [],
      [CoreQuestionNames.ProjectType]: "tab-type",
      [CoreQuestionNames.Capabilities]: TabNonSsoItem().id,
    };
    const fxCore = new FxCore(tools);
    const res2 = await fxCore.createProject(inputs);

    assert.isTrue(res2.isOk());
    assert.equal(generator.args[0][2], TemplateNames.Tab);
  });

  it("provision happy path from zero", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
      environmentFolderPath: "./envs",
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(resourceGroupHelper, "createNewResourceGroup").resolves(ok("test-rg"));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    sandbox.stub(fs, "writeFile").resolves();
    const progressStartStub = sandbox.stub();
    const progressEndStub = sandbox.stub();
    sandbox.stub(tools.ui, "createProgressBar").returns({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
      isLocalDebug: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
    // getSelectedEnv
    const selectEnvRes = await fxCore.getSelectedEnv(inputs);
    if (selectEnvRes.isErr()) {
      console.log(selectEnvRes.error);
    }
    assert.isTrue(selectEnvRes.isOk());
    if (selectEnvRes.isOk()) {
      assert.equal(selectEnvRes.value, "dev");
    }
    assert.isTrue(progressStartStub.calledOnce);
    assert.isTrue(progressEndStub.calledOnceWithExactly(true));
  });
  it("provision success with subscriptionId in yml", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: {
              subscriptionId: "mockSubId",
            },
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(resourceGroupHelper, "createNewResourceGroup").resolves(ok("test-rg"));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
  });
  it("provision happy path from zero case 2", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(resourceGroupHelper, "createNewResourceGroup").resolves(ok("test-rg"));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
  });
  it("provision happy path: validate multi-env", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          const map = new Map();
          map.set("KEY1", "VALUE1");
          map.set("SECRET_KEY2", "VALUE2");
          return { result: ok(map), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });

    sandbox.stub(resourceGroupHelper, "createNewResourceGroup").resolves(ok("test-rg"));

    sandbox.stub(fs, "pathExists").resolves(false);
    sandbox.stub(fs, "ensureFile").resolves();
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ version: "1.0", trackingId: "mockTrackingId" }));
    const fileDataMap = new Map();
    sandbox.stub(fs, "writeFile").callsFake(async (file: PathLike | number, data: any) => {
      fileDataMap.set(file, data);
    });
    const appName = randomAppName();
    const projectPath = path.resolve(os.tmpdir(), appName);
    const envFilePath = path.resolve(projectPath, "env", ".env.dev");
    const userDataFilePath = envFilePath + ".user";
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok(envFilePath));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: projectPath,
      ignoreLockByUT: true,
      env: "dev",
      workflowFilePath: path.resolve(projectPath, "teamsapp.yml"),
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
    const envData = fileDataMap.get(envFilePath);
    const pRes1 = dotenvUtil.deserialize(envData);
    const secretData = fileDataMap.get(userDataFilePath);
    const pRes2 = dotenvUtil.deserialize(secretData);
    assert.equal(pRes1.obj["KEY1"], "VALUE1");
    assert.isUndefined(pRes1.obj["SECRET_KEY2"]);
    assert.isTrue(pRes2.obj["SECRET_KEY2"].startsWith("crypto_"));
  });
  it("provision happy path with existing resource groups in VS Code", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: false,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
  });
  it("provision failed to get selected subscription", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox
      .stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription")
      .resolves(undefined);
    sandbox.stub(resourceGroupHelper, "createNewResourceGroup").resolves(ok("test-rg"));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
      env: "dev",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof SelectSubscriptionError);
    }
  });
  it("provision SPFx project shows success notification", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const stubShowMessage = sandbox.stub(tools.ui, "showMessage");

    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
    assert.isTrue(stubShowMessage.calledOnce);
  });
  it("provision failed when user directly update yml with empty subscriptionId", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: {
              subscriptionId: "",
            },
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision failed with parse error", async () => {
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(err(new UserError({})));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision failed to get subInfo", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );

    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox
      .stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription")
      .resolves(undefined);
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();

    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision failed getLifecycleDescriptions Error", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(resourceGroupHelper, "createNewResourceGroup").resolves(ok("test-rg"));
    sandbox
      .stub(SummaryReporter.prototype, "getLifecycleDescriptions")
      .returns(err(new UserError({})));
    const progressStartStub = sandbox.stub();
    const progressEndStub = sandbox.stub();
    sandbox.stub(tools.ui, "createProgressBar").returns({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    assert.isTrue(progressStartStub.calledOnce);
    assert.isTrue(progressEndStub.calledOnceWithExactly(false));
  });
  it("provision failed with partial success", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return {
            result: err({
              kind: "PartialSuccess",
              env: new Map(),
              reason: {
                kind: "DriverError",
                failedDriver: { uses: "", with: {} },
                error: new UserError({}),
              },
            }),
            summaries: [],
          };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(resourceGroupHelper, "createNewResourceGroup").resolves(ok("test-rg"));
    const progressStartStub = sandbox.stub();
    const progressEndStub = sandbox.stub();
    sandbox.stub(tools.ui, "createProgressBar").returns({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    // sandbox
    //   .stub(SummaryReporter.prototype, "getLifecycleDescriptions")
    //   .resolves(err(new UserError({})));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    assert.isTrue(progressStartStub.calledOnce);
    assert.isTrue(progressEndStub.calledOnceWithExactly(false));
  });
  it("provision failed with getM365TenantId Error", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox
      .stub(provisionUtils, "getM365TenantId")
      .resolves(err(new UserError({ source: "Tst", name: "TestError" })));
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision failed with getSelectedSubscription Error", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox
      .stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription")
      .resolves(undefined);
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision happy path with CLI inputs", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(resourceGroupHelper, "createNewResourceGroup").resolves(ok("test-rg"));
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: ".",
      env: "dev",
      targetSubscriptionId: "mockSubId",
      targetResourceGroupName: "test-rg",
      targetResourceLocationName: "Ease US",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
  });
  it("provision happy path with CLI inputs for existing resource group", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox
      .stub(resourceGroupHelper, "createNewResourceGroup")
      .resolves(err(new ResourceGroupConflictError("xxx", "sss")));
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      targetSubscriptionId: "mockSubId",
      targetResourceGroupName: "test-rg",
      targetResourceLocationName: "Ease US",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
  });
  it("provision failed with CLI inputs: create resource group failed", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox
      .stub(resourceGroupHelper, "createNewResourceGroup")
      .resolves(err(new UserError({ source: "test", name: "OtherError" })));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: ".",
      env: "dev",
      targetSubscriptionId: "mockSubId",
      targetResourceGroupName: "test-rg",
      targetResourceLocationName: "Ease US",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision failed when getting azure credentials", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox
      .stub(tools.tokenProvider.azureAccountProvider, "getIdentityCredentialAsync")
      .resolves(undefined);
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof InvalidAzureCredentialError);
    }
  });
  it("provision failed when checking resource group existence", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getIdentityCredentialAsync").resolves({
      getToken: (scopes: string) => {
        return Promise.resolve({ token: "token", expiresOnTimestamp: 1 });
      },
    });
    sandbox
      .stub(resourceGroupHelper, "checkResourceGroupExistence")
      .resolves(err(new SystemError("test", "test", "", "")));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "test");
    }
  });
  it("provision happy path (debug)", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      workflowFilePath: "./app.local.yml",
      env: "local",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    if (res.isErr()) {
      console.log(res?.error);
    }
    assert.isTrue(res.isOk());
  });

  it("provision happy path (VS debug)", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.VS,
      projectPath: ".",
      workflowFilePath: "./app.local.yml",
      env: "local",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    if (res.isErr()) {
      console.log(res?.error);
    }
    assert.isTrue(res.isOk());
  });

  it("provision failed with check whether m365 tenant matched fail", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox
      .stub(provisionUtils, "ensureM365TenantMatchesV3")
      .resolves(err(new UserError("coordinator", "checkM365TenantError", "msg", "msg")));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "checkM365TenantError");
    }
  });
  it("provision failed with no subscription permission", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox
      .stub(tools.tokenProvider.azureAccountProvider, "setSubscription")
      .rejects(new UserError({ source: "Test", name: "NoPermission" }));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision with no progress bar", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
      environmentFolderPath: "./envs",
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureSubscription").resolves(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    sandbox.stub(provisionUtils, "ensureResourceGroup").resolves(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(provisionUtils, "askForProvisionConsentV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").resolves({
      subscriptionId: "mockSubId",
      tenantId: "mockTenantId",
      subscriptionName: "mockSubName",
    });
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "setSubscription").resolves();
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(resourceGroupHelper, "createNewResourceGroup").resolves(ok("test-rg"));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    sandbox.stub(fs, "writeFile").resolves();
    sandbox.stub(tools.ui, "createProgressBar").returns(undefined as any as IProgressHandler);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
      isLocalDebug: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
    // getSelectedEnv
    const selectEnvRes = await fxCore.getSelectedEnv(inputs);
    if (selectEnvRes.isErr()) {
      console.log(selectEnvRes.error);
    }
    assert.isTrue(selectEnvRes.isOk());
    if (selectEnvRes.isOk()) {
      assert.equal(selectEnvRes.value, "dev");
    }
  });

  it("deploy happy path", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "deploy",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [{ uses: "azureStorage/deploy", with: "" }],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(deployUtils, "askForDeployConsentV3").resolves(ok(Void));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    assert.isTrue(res.isOk());
  });
  it("deploy happy path - VS", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "deploy",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [{ uses: "azureStorage/deploy", with: "" }],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(tools.ui, "showMessage").resolves(ok(undefined));
    sandbox.stub(deployUtils, "askForDeployConsentV3").resolves(ok(Void));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VS,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    assert.isTrue(res.isOk());
  });
  it("deploy cancel", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "deploy",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [{ uses: "azureStorage/deploy", with: "" }],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox
      .stub(deployUtils, "askForDeployConsentV3")
      .resolves(err(new UserError(SolutionSource, "UserCancel", "UserCancel")));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    assert.isTrue(res.isErr());
  });
  it("deploy happy path (debug)", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "configureApp",
        driverDefs: [],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    const progressStartStub = sandbox.stub();
    const progressEndStub = sandbox.stub();
    sandbox.stub(tools.ui, "createProgressBar").returns({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      workflowFilePath: "./app.local.yml",
      env: "local",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    if (res.isErr()) {
      console.log(res?.error);
    }
    assert.isTrue(res.isOk());
    assert.isTrue(progressStartStub.calledOnce);
    assert.isTrue(progressEndStub.calledOnceWithExactly(true));
  });
  it("deploy failed partial success", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "deploy",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return {
            result: err({
              kind: "PartialSuccess",
              env: new Map(),
              reason: {
                kind: "DriverError",
                failedDriver: { uses: "", with: {} },
                error: new UserError({}),
              },
            }),
            summaries: [],
          };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const progressStartStub = sandbox.stub();
    const progressEndStub = sandbox.stub();
    sandbox.stub(tools.ui, "createProgressBar").returns({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    assert.isTrue(res.isErr());
    assert.isTrue(progressStartStub.calledOnce);
    assert.isTrue(progressEndStub.calledOnceWithExactly(false));
  });
  it("deploy without progress bar", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "deploy",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [{ uses: "azureStorage/deploy", with: "" }],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    sandbox.stub(deployUtils, "askForDeployConsentV3").resolves(ok(Void));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    sandbox.stub(tools.ui, "createProgressBar").returns(undefined as any as IProgressHandler);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    assert.isTrue(res.isOk());
  });
  it("publish happy path", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const progressStartStub = sandbox.stub();
    const progressEndStub = sandbox.stub();
    sandbox.stub(tools.ui, "createProgressBar").returns({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    const showMessageStub = sandbox
      .stub(tools.ui, "showMessage")
      .callsFake(async (level, msg, modal, ...items) => {
        if (items.length > 0 && items[0].includes("admin portal")) {
          return ok(items[0]);
        }
        return ok("");
      });
    const openUrlStub = sandbox.stub(tools.ui, "openUrl").resolves(ok(true));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isOk());
    assert.isTrue(showMessageStub.calledOnce);
    assert.isTrue(progressStartStub.calledOnce);
    assert.isTrue(progressEndStub.calledOnceWithExactly(true));
    assert.isTrue(openUrlStub.calledOnce);
  });
  it("publish happy path - CLI", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return {
            result: err({
              kind: "Failure",
              error: { source: "test", timestamp: new Date() },
            } as ExecutionError),
            summaries: [],
          };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const progressStartStub = sandbox.stub();
    const progressEndStub = sandbox.stub();
    sandbox.stub(tools.ui, "createProgressBar").returns({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error.message.indexOf("test") !== -1);
    }
    assert.deepEqual(inputs.envVars, {} as DotenvParseOutput);
    assert.isTrue(progressStartStub.calledOnce);
    assert.isTrue(progressEndStub.calledOnceWithExactly(false));
  });
  it("publish happy path - no ui", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    const mockTools = new MockTools();
    mockTools.ui = undefined as any;
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
      env: "dev",
    };
    const fxCore = new FxCore(mockTools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isOk());
  });
  it("publish happy path - VS - no ui", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    const mockTools = new MockTools();
    mockTools.ui = undefined as any;
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VS,
      projectPath: ".",
      ignoreLockByUT: true,
      env: "dev",
    };
    const fxCore = new FxCore(mockTools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isOk());
  });
  it("publish failed", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return {
            result: err({
              kind: "Failure",
              error: { source: "test", timestamp: new Date() },
            } as ExecutionError),
            summaries: [],
          };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const progressStartStub = sandbox.stub();
    const progressEndStub = sandbox.stub();
    sandbox.stub(tools.ui, "createProgressBar").returns({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error.message.indexOf("test") !== -1);
    }
    assert.deepEqual(inputs.envVars, {} as DotenvParseOutput);
    assert.isTrue(progressStartStub.calledOnce);
    assert.isTrue(progressEndStub.calledOnceWithExactly(false));
  });
  it("publish without progress bar", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(tools.ui, "selectOption").callsFake(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const progressStartStub = sandbox.stub();
    const progressEndStub = sandbox.stub();
    sandbox.stub(tools.ui, "createProgressBar").returns(undefined as any as IProgressHandler);
    const showMessageStub = sandbox.stub(tools.ui, "showMessage").resolves(ok(""));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    sandbox.stub(fs, "pathExistsSync").onFirstCall().returns(false).onSecondCall().returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isOk());
    assert.isTrue(showMessageStub.called);
    assert.isTrue(progressStartStub.notCalled);
    assert.isTrue(progressEndStub.notCalled);
  });
  it("provision lifecycle undefined", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const context = createDriverContext(inputs);
    const res = await coordinator.provision(context, inputs);
    assert.isTrue(res.isErr() && res.error.name === "LifeCycleUndefinedError");
  });
  it("deploy lifecycle undefined", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const context = createDriverContext(inputs);
    const res = await coordinator.deploy(context, inputs);
    assert.isTrue(res.isErr() && res.error.name === "LifeCycleUndefinedError");
  });
  it("publish lifecycle undefined", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(pathUtils, "getYmlFilePath").resolves(ok("teamsapp.yml"));
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const context = createDriverContext(inputs);
    const res = await coordinator.publish(context, inputs);
    assert.isTrue(res.isErr() && res.error.name === "LifeCycleUndefinedError");
  });
  it("convertExecuteResult ok", async () => {
    const value = new Map([["key", "value"]]);
    const res: Result<ExecutionOutput, ExecutionError> = ok(value);
    const convertRes = coordinator.convertExecuteResult(res, ".");
    assert.deepEqual(convertRes[0], { key: "value" });
    assert.isUndefined(convertRes[1]);
  });

  it("convertExecuteResult Failure", async () => {
    const error = new UserError({ source: "test", name: "TestError", message: "test message" });
    const res: Result<ExecutionOutput, ExecutionError> = err({ kind: "Failure", error: error });
    const convertRes = coordinator.convertExecuteResult(res, ".");
    assert.deepEqual(convertRes[0], {});
    assert.equal(convertRes[1], error);
  });

  it("convertExecuteResult PartialSuccess - DriverError", async () => {
    const value = new Map([["key", "value"]]);
    const error = new UserError({ source: "test", name: "TestError", message: "test message" });
    const res: Result<ExecutionOutput, ExecutionError> = err({
      kind: "PartialSuccess",
      env: value,
      reason: {
        kind: "DriverError",
        error: error,
        failedDriver: { name: "TestDriver", uses: "testUse", with: "testWith" },
      },
    });
    const convertRes = coordinator.convertExecuteResult(res, ".");
    assert.deepEqual(convertRes[0], { key: "value" });
    assert.equal(convertRes[1], error);
  });

  it("convertExecuteResult PartialSuccess - MissingEnvironmentVariablesError", async () => {
    const value = new Map([["key", "value"]]);
    const res: Result<ExecutionOutput, ExecutionError> = err({
      kind: "PartialSuccess",
      env: value,
      reason: {
        kind: "UnresolvedPlaceholders",
        unresolvedPlaceHolders: ["TEST_PL"],
        failedDriver: { name: "TestDriver", uses: "testUse", with: "testWith" },
      },
    });
    const convertRes = coordinator.convertExecuteResult(res, ".");
    assert.deepEqual(convertRes[0], { key: "value" });
    assert.isTrue(convertRes[1]! instanceof MissingEnvironmentVariablesError);
  });

  it("preProvisionForVS", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      registerApp: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: {
              subscriptionId: "mockSubId",
              resourceGroupName: "mockRG",
            },
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: [],
          });
        },
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(pathUtils, "getEnvFilePath").resolves(ok("."));
    sandbox.stub(fs, "pathExistsSync").returns(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.preProvisionForVS(inputs);
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      const value = res.value;
      assert.isTrue(value.needAzureLogin);
      assert.isTrue(value.needM365Login);
      assert.equal(value.resolvedAzureSubscriptionId, "mockSubId");
      assert.equal(value.resolvedAzureResourceGroupName, "mockRG");
    }
  });
  it("provision select subscription cancel", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      registerApp: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        run: async (ctx: DriverContext) => {
          return ok({
            env: new Map(),
            unresolvedPlaceHolders: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"],
          });
        },
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    sandbox.stub(MetadataUtil.prototype, "parse").resolves(ok(mockProjectModel));
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev", "prod"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "ensureM365TenantMatchesV3").resolves(ok(undefined));
    sandbox.stub(provisionUtils, "getM365TenantId").resolves(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    sandbox.stub(tools.tokenProvider.azureAccountProvider, "getIdentityCredentialAsync").resolves();
    sandbox
      .stub(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription")
      .rejects(new UserCancelError());
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });

  it("buildAadManifest", async () => {
    sandbox.stub(FxCoreV3Implement.prototype, "buildAadManifest").resolves(ok(Void));
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    const fxCore = new FxCore(tools);
    const res1 = await fxCore.buildAadManifest(inputs);
    assert.isTrue(res1.isOk());
  });
  it("executeUserTaskNew", async () => {
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    sandbox.stub(envUtil, "writeEnv").resolves(ok(undefined));
    sandbox.stub(manifestUtils, "getTeamsAppManifestPath").resolves("");
    const driver1: ValidateManifestDriver = Container.get("teamsApp/validateManifest");
    const driver2: CreateAppPackageDriver = Container.get("teamsApp/zipAppPackage");
    const driver3: ValidateAppPackageDriver = Container.get("teamsApp/validateAppPackage");
    sandbox.stub(driver1, "run").resolves(ok(new Map()));
    sandbox.stub(driver2, "run").resolves(ok(new Map()));
    sandbox.stub(driver3, "run").resolves(ok(new Map()));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res1 = await fxCore.executeUserTask(
      { namespace: "", method: "getManifestTemplatePath", params: { manifestTemplatePath: "." } },
      inputs
    );
    if (res1.isErr()) console.log(res1.error);
    assert.isTrue(res1.isOk());
    const res2 = await fxCore.executeUserTask(
      { namespace: "", method: "validateManifest", params: { manifestPath: "." } },
      inputs
    );
    if (res2.isErr()) console.log(res2.error);
    assert.isTrue(res2.isOk());
    const res3 = await fxCore.executeUserTask(
      {
        namespace: "",
        method: "buildPackage",
        params: { manifestTemplatePath: ".", outputZipPath: ".", outputJsonPath: "." },
      },
      inputs
    );
    if (res3.isErr()) console.log(res3.error);
    assert.isTrue(res3.isOk());
    const res4 = await fxCore.executeUserTask(
      { namespace: "", method: "validateManifest", params: { appPackagePath: "." } },
      inputs
    );
    assert.isTrue(res4.isOk());
  });
  it("getDotEnvs success", async () => {
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev1", "dev2"]));
    sandbox.stub(envUtil, "readEnv").resolves(ok({ k1: "v1" }));
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.getDotEnvs(inputs);
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(Object.keys(res.value), ["dev1", "dev2"]);
    }
  });
  it("getDotEnvs error 1", async () => {
    sandbox.stub(envUtil, "listEnv").resolves(err(new UserError({})));
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.getDotEnvs(inputs);
    assert.isTrue(res.isErr());
  });
  it("getDotEnvs error 2", async () => {
    sandbox.stub(envUtil, "listEnv").resolves(ok(["dev1", "dev2"]));
    sandbox.stub(envUtil, "readEnv").resolves(err(new UserError({})));
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.getDotEnvs(inputs);
    assert.isTrue(res.isErr());
  });

  it("getSelectedEnv", async () => {
    sandbox.stub(envUtil, "readEnv").resolves(ok({}));
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.getSelectedEnv(inputs);
    assert.isTrue(res.isOk());
  });
  it("listCollaboratorFunc", async () => {
    sandbox.stub(coll, "listCollaborator").resolves(err(new UserError({})));
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
    };
    const res = await listCollaboratorFunc(inputs);
    assert.isTrue(res.isErr());
  });
  it("checkPermissionFunc", async () => {
    sandbox.stub(coll, "checkPermission").resolves(err(new UserError({})));
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
    };
    const res = await checkPermissionFunc(inputs);
    assert.isTrue(res.isErr());
  });
  it("grantPermissionFunc", async () => {
    sandbox.stub(coll, "grantPermission").resolves(err(new UserError({})));
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
    };
    const res = await grantPermissionFunc(inputs);
    assert.isTrue(res.isErr());
  });
  describe("encrypt/decrypt", () => {
    afterEach(() => {
      sandbox.restore();
    });
    it("error", async () => {
      sandbox.stub(settingsUtil, "readSettings").resolves(err(new UserError({})));
      const inputs: InputsWithProjectPath = {
        platform: Platform.VSCode,
        projectPath: ".",
      };
      const fxCore = new FxCore(tools);
      const inputText = "abc";
      const res = await fxCore.encrypt(inputText, inputs);
      assert.isTrue(res.isErr());
      const res2 = await fxCore.decrypt("abc", inputs);
      assert.isTrue(res2.isErr());
    });
    it("happy path", async () => {
      sandbox
        .stub(settingsUtil, "readSettings")
        .resolves(ok({ version: "1", trackingId: "mockid" }));
      const inputs: InputsWithProjectPath = {
        platform: Platform.VSCode,
        projectPath: ".",
      };
      const fxCore = new FxCore(tools);
      const inputText = "abc";
      const res = await fxCore.encrypt(inputText, inputs);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        const res2 = await fxCore.decrypt(res.value, inputs);
        assert.isTrue(res2.isOk());
        if (res2.isOk()) {
          assert.equal(res2.value, inputText);
        }
      }
    });
  });

  describe("publishInDeveloperPortal", () => {
    afterEach(() => {
      sandbox.restore();
    });
    it("missing token provider", async () => {
      const context = createContextV3();
      context.tokenProvider = undefined;
      const inputs: InputsWithProjectPath = {
        platform: Platform.VSCode,
        projectPath: "project-path",
        [CoreQuestionNames.AppPackagePath]: "path",
      };
      const res = await coordinator.publishInDeveloperPortal(context, inputs);
      assert.isTrue(res.isErr());
    });

    it("missing appPackagePath", async () => {
      const context = createContextV3();
      context.tokenProvider = {
        m365TokenProvider: new MockM365TokenProvider(),
        azureAccountProvider: new MockAzureAccountProvider(),
      };
      const inputs: InputsWithProjectPath = {
        platform: Platform.VSCode,
        projectPath: "project-path",
      };
      const res = await coordinator.publishInDeveloperPortal(context, inputs);
      assert.isTrue(res.isErr());
    });

    it("success", async () => {
      const context = createContextV3();
      context.tokenProvider = {
        m365TokenProvider: new MockM365TokenProvider(),
        azureAccountProvider: new MockAzureAccountProvider(),
      };
      sandbox
        .stub(context.tokenProvider.m365TokenProvider, "getJsonObject")
        .resolves(ok({ unique_name: "test" }));
      sandbox.stub(appStudio, "updateTeamsAppV3ForPublish").resolves(ok("appId"));
      const openUrl = sandbox.stub(context.userInteraction, "openUrl").resolves(ok(true));
      const inputs: InputsWithProjectPath = {
        platform: Platform.VSCode,
        projectPath: "project-path",
        [CoreQuestionNames.AppPackagePath]: "path",
      };

      const res = await coordinator.publishInDeveloperPortal(context, inputs);
      assert.isTrue(res.isOk());
      assert.isTrue(openUrl.calledOnce);
    });

    it("update manifest error", async () => {
      const context = createContextV3();
      context.tokenProvider = {
        m365TokenProvider: new MockM365TokenProvider(),
        azureAccountProvider: new MockAzureAccountProvider(),
      };
      sandbox
        .stub(appStudio, "updateTeamsAppV3ForPublish")
        .resolves(err(new UserError("source", "error", "", "")));
      const inputs: InputsWithProjectPath = {
        platform: Platform.VSCode,
        projectPath: "project-path",
        [CoreQuestionNames.AppPackagePath]: "path",
      };

      const res = await coordinator.publishInDeveloperPortal(context, inputs);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.name, "error");
      }
    });

    it("ensureTeamsFxInCsproj  no .csproj found", async () => {
      sandbox.stub(fs, "readdir").resolves([] as any);
      const res = await coordinator.ensureTeamsFxInCsproj(".");
      assert.isTrue(res.isOk());
    });

    it("ensureTeamsFxInCsproj success: do nothing for existing ItemGroup", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Project Sdk="Microsoft.NET.Sdk">
        <ItemGroup>
          <ProjectCapability Include="TeamsFx"/>
        </ItemGroup>
      </Project>`;
      sandbox.stub(fs, "readdir").resolves(["test.csproj"] as any);
      sandbox.stub(fs, "readFile").resolves(xml as any);
      const res = await coordinator.ensureTeamsFxInCsproj(".");
      assert.isTrue(res.isOk());
    });

    it("ensureTeamsFxInCsproj success: insert one", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Project Sdk="Microsoft.NET.Sdk">
      </Project>`;
      sandbox.stub(fs, "readdir").resolves(["test.csproj"] as any);
      sandbox.stub(fs, "readFile").resolves(xml as any);
      sandbox.stub(fs, "writeFile").resolves();
      const res = await coordinator.ensureTeamsFxInCsproj(".");
      assert.isTrue(res.isOk());
    });
  });
});

describe("Office Addin", async () => {
  const sandbox = sinon.createSandbox();
  const tools = new MockTools();
  tools.ui = new MockedUserInteraction();
  setTools(tools);

  afterEach(() => {
    sandbox.restore();
  });

  it("should scaffold taskpane successfully", async () => {
    const coordinator = new Coordinator();
    const v3ctx = createContextV3();
    v3ctx.userInteraction = new MockedUserInteraction();

    sandbox.stub(OfficeAddinGenerator, "generate").resolves(ok(undefined));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));

    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.ProjectType]: NewProjectTypeOutlookAddinOptionItem().id,
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.CreateFromScratch]: CreateNewOfficeAddinOption().id,
    };
    const res = await coordinator.create(v3ctx, inputs);
    assert.isTrue(res.isOk());
  });

  it("should return error if app name is invalid", async () => {
    const coordinator = new Coordinator();
    const v3ctx = createContextV3();
    v3ctx.userInteraction = new MockedUserInteraction();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: "__invalid__",
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionYesVSC().id,
      [CoreQuestionNames.ProjectType]: NewProjectTypeOutlookAddinOptionItem().id,
    };

    const res = await coordinator.create(v3ctx, inputs);
    assert.isTrue(res.isErr() && res.error instanceof InputValidationError);
  });

  it("should return error if app name is undefined", async () => {
    const coordinator = new Coordinator();
    const v3ctx = createContextV3();
    v3ctx.userInteraction = new MockedUserInteraction();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: undefined,
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionYesVSC().id,
      [CoreQuestionNames.ProjectType]: NewProjectTypeOutlookAddinOptionItem().id,
    };

    const res = await coordinator.create(v3ctx, inputs);
    assert.isTrue(res.isErr() && res.error instanceof MissingRequiredInputError);
  });

  it("should return error if OfficeAddinGenerator returns error", async () => {
    const coordinator = new Coordinator();
    const v3ctx = createContextV3();
    v3ctx.userInteraction = new MockedUserInteraction();

    const mockedError = new SystemError("mockedSource", "mockedError", "mockedMessage");
    sandbox.stub(OfficeAddinGenerator, "generate").resolves(err(mockedError));
    sandbox
      .stub(settingsUtil, "readSettings")
      .resolves(ok({ trackingId: "mockId", version: V3Version }));
    sandbox.stub(settingsUtil, "writeSettings").resolves(ok(""));

    const inputs: Inputs = {
      platform: Platform.VSCode,
      folder: ".",
      [CoreQuestionNames.AppName]: randomAppName(),
      [CoreQuestionNames.CreateFromScratch]: ScratchOptionYesVSC().id,
      [CoreQuestionNames.ProjectType]: NewProjectTypeOutlookAddinOptionItem().id,
    };
    const res = await coordinator.create(v3ctx, inputs);
    assert.isTrue(res.isErr() && res.error.name === "mockedError");
  });
});
