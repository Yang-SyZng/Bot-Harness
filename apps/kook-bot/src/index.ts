import { PiAgentRuntimeAdapter, createConfiguredPiSessionFactory } from "@kookbot/agent-pi";
import { APPLICATION_PACKAGE, AcceptIncomingEnvelope, type Logger } from "@kookbot/application";
import { DOMAIN_PACKAGE } from "@kookbot/domain";
import { MemoryStore, PERSISTENCE_PACKAGE, fakeUnitOfWorkFactory } from "@kookbot/persistence";
import {
  KOOK_SDK_VERSION,
  KookGateway,
  KookMessageNormalizer,
  KookPublisher,
  PLATFORM_KOOK_PACKAGE,
  createKookClient,
  type KookClient,
} from "@kookbot/platform-kook";
import { STORAGE_PACKAGE } from "@kookbot/storage";
import { TOOLS_PACKAGE } from "@kookbot/tools";

import { loadRuntimeConfig, type RuntimeConfig } from "./bootstrap/config.js";
import { createJsonLogger } from "./bootstrap/json-logger.js";
import { MemoryOutboxWorker } from "./worker/index.js";

export interface KookBotApplication {
  readonly store: MemoryStore;
  readonly gateway: KookGateway;
  readonly worker: MemoryOutboxWorker;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function buildApplication(
  config: RuntimeConfig,
  logger: Logger,
  client: KookClient = createKookClient(config.platformToken.reveal()),
): KookBotApplication {
  const store = new MemoryStore();
  const makeUnitOfWork = fakeUnitOfWorkFactory(store);
  const runtime = new PiAgentRuntimeAdapter(
    createConfiguredPiSessionFactory({
      provider: config.llmProvider,
      model: config.llmModelId,
      apiKey: config.apiKey.reveal(),
      baseUrl: config.baseUrl.toString(),
      api: config.piApi,
      thinkingLevel: config.thinkingLevel,
    }),
  );
  const worker = new MemoryOutboxWorker(
    makeUnitOfWork,
    runtime,
    new KookPublisher(client),
    logger.child({ component: "worker" }),
  );
  const accept = new AcceptIncomingEnvelope(makeUnitOfWork);
  const gateway = new KookGateway(
    client,
    new KookMessageNormalizer(),
    async (incoming) => {
      const result = await accept.execute(incoming);
      logger.info("kook.message_accepted", { ...result });
      await worker.drain();
    },
    logger.child({ component: "gateway" }),
  );
  return {
    store,
    gateway,
    worker,
    start: async () => {
      await gateway.start();
      await worker.drain();
    },
    stop: () => gateway.stop(),
  };
}

export async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const logger = createJsonLogger("kook-bot");
  logger.info("application.bootstrap", {
    baseUrl: config.baseUrl.origin,
    language: config.language,
    llmModelId: config.llmModelId,
    packages: [
      DOMAIN_PACKAGE,
      APPLICATION_PACKAGE,
      "@kookbot/agent-pi",
      TOOLS_PACKAGE,
      PLATFORM_KOOK_PACKAGE,
      PERSISTENCE_PACKAGE,
      STORAGE_PACKAGE,
    ],
    kookSdkVersion: KOOK_SDK_VERSION,
  });
  const application = buildApplication(config, logger);
  let stopping = false;
  const stop = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info("application.stopping", { signal });
    void application
      .stop()
      .catch((error: unknown) => {
        logger.error("application.stop_failed", { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        logger.info("application.stopped");
      });
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  await application.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    const logger = createJsonLogger("kook-bot");
    logger.error("application.start_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}
