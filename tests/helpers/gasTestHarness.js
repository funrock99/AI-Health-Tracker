const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const GAS_FILES = [
  "Config.gs",
  "Logger.gs",
  "ValidationService.gs",
  "AuthService.gs",
  "NotionRepository.gs",
  "DashboardService.gs",
  "LineService.gs",
  "GeminiService.gs",
  "Code.gs"
];

function createCacheStore() {
  const store = new Map();
  return {
    get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    put(key, value) {
      store.set(key, String(value));
    },
    remove(key) {
      store.delete(key);
    }
  };
}

function createBaseContext(overrides = {}) {
  const scriptCache = createCacheStore();
  const userCache = createCacheStore();
  const properties = {};

  const context = {
    console,
    JSON,
    Math,
    Date,
    parseFloat,
    parseInt,
    isNaN,
    setTimeout,
    clearTimeout,
    UrlFetchApp: {
      fetch() {
        throw new Error("UrlFetchApp.fetch mock is required in this test");
      }
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) {
        return {
          text,
          mimeType: null,
          setMimeType(mimeType) {
            this.mimeType = mimeType;
            return this;
          },
          getContent() {
            return this.text;
          }
        };
      }
    },
    CacheService: {
      getScriptCache() {
        return scriptCache;
      },
      getUserCache() {
        return userCache;
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return Object.prototype.hasOwnProperty.call(properties, key) ? properties[key] : null;
          }
        };
      }
    },
    Utilities: {
      base64Encode(bytes) {
        return Buffer.from(bytes).toString("base64");
      },
      getUuid() {
        return "uuid-test-value";
      }
    },
    ...overrides
  };

  context.global = context;
  context.__scriptCache = scriptCache;
  context.__userCache = userCache;
  context.__properties = properties;
  return context;
}

function loadGasContext(overrides = {}) {
  const context = createBaseContext(overrides);
  vm.createContext(context);

  for (const relativeFile of GAS_FILES) {
    const absoluteFile = path.join(PROJECT_ROOT, relativeFile);
    const source = fs.readFileSync(absoluteFile, "utf8");
    vm.runInContext(source, context, { filename: absoluteFile });
  }

  return context;
}

module.exports = {
  loadGasContext
};
