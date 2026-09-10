import type { LogFields, Logger, LogLevel } from "@kookbot/application";

type LogSink = (line: string) => void;

const SECRET_KEY = /(authorization|api[-_]?key|password|secret|token)/i;
const REDACTED = "[REDACTED]";

function sanitize(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (SECRET_KEY.test(key)) {
    return REDACTED;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, "", seen));
  }
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey, seen)]),
  );
}

export function createJsonLogger(
  service: string,
  sink: LogSink = (line) => process.stdout.write(`${line}\n`),
  now: () => Date = () => new Date(),
  bindings: LogFields = {},
): Logger {
  const write = (level: LogLevel, event: string, fields: LogFields = {}): void => {
    const safeFields = sanitize({ ...bindings, ...fields }) as Record<string, unknown>;
    sink(
      JSON.stringify({
        timestamp: now().toISOString(),
        level,
        service,
        event,
        ...safeFields,
      }),
    );
  };

  return {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    child: (childBindings) => createJsonLogger(service, sink, now, { ...bindings, ...childBindings }),
  };
}
