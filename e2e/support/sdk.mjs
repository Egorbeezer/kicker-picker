const getRuntime = () => globalThis.__kpE2eRuntime;

export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      return getRuntime().sdk.db[prop];
    },
  }
);

export const api = new Proxy(
  {},
  {
    get(_target, prop) {
      return getRuntime().sdk.api[prop];
    },
  }
);

export function fetch(...args) {
  return getRuntime().sdk.fetch(...args);
}

export class EndpointError extends Error {
  constructor(msg, opts) {
    super(msg);
    this.parameters = opts;
  }
}

export class BotApiError extends Error {
  constructor(msg, opts) {
    super(msg);
    this.code = opts?.code;
    this.description = opts?.description || msg;
    this.parameters = opts?.parameters;
  }
}

export class InputFile {
  constructor(data, name, opts) {
    this.data = data;
    this.name = name;
    this.opts = opts;
  }
}
