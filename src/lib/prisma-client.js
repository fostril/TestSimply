const { randomUUID } = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");

const DATA_PATH = path.resolve(__dirname, "../../data/demo-data.json");

const loadData = () => {
  try {
    const content = fs.readFileSync(DATA_PATH, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return { projects: [], users: [], plans: [], executions: [], cases: [], results: [], tokens: [], accounts: [], sessions: [], verificationTokens: [], attachments: [], requirements: [] };
  }
};

const persistData = (data) => {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const matchWhere = (record, where) => {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR" && Array.isArray(value)) {
      return value.some((clause) => matchWhere(record, clause));
    }
    if (key === "AND" && Array.isArray(value)) {
      return value.every((clause) => matchWhere(record, clause));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (record[key] && typeof record[key] === "object") {
        return matchWhere(record[key], value);
      }
      if (!record[key] && key.includes("_")) {
        return Object.entries(value).every(([nestedKey, nestedValue]) => {
          return record[nestedKey] === nestedValue;
        });
      }
      return record[key] === value;
    }
    return record[key] === value;
  });
};

const createModel = (client, collection) => {
  const getData = () => client._data[collection];
  const save = () => persistData(client._data);

  return {
    async findFirst(args = {}) {
      return clone(getData().find((item) => matchWhere(item, args.where)) ?? null);
    },
    async findUnique(args = {}) {
      return clone(getData().find((item) => matchWhere(item, args.where)) ?? null);
    },
    async findMany(args = {}) {
      const records = getData().filter((item) => matchWhere(item, args.where));
      return clone(records);
    },
    async create(args = {}) {
      const record = { id: args.data?.id ?? randomUUID(), ...clone(args.data ?? {}) };
      getData().push(record);
      save();
      return clone(record);
    },
    async createMany(args = {}) {
      const items = Array.isArray(args.data) ? args.data : [];
      const created = items.map((item) => ({ id: item.id ?? randomUUID(), ...clone(item) }));
      const data = getData();
      data.push(...created);
      save();
      return { count: created.length };
    },
    async update(args = {}) {
      const data = getData();
      const index = data.findIndex((item) => matchWhere(item, args.where));
      if (index === -1) {
        throw new Error("Record not found");
      }
      data[index] = { ...data[index], ...clone(args.data ?? {}) };
      save();
      return clone(data[index]);
    },
    async delete(args = {}) {
      const data = getData();
      const index = data.findIndex((item) => matchWhere(item, args.where));
      if (index === -1) {
        throw new Error("Record not found");
      }
      const [removed] = data.splice(index, 1);
      save();
      return clone(removed);
    }
  };
};

class PrismaClient {
  constructor() {
    this._data = loadData();
    this.user = createModel(this, "users");
    this.project = createModel(this, "projects");
    this.testCase = createModel(this, "cases");
    this.testResult = createModel(this, "results");
    this.testExecution = createModel(this, "executions");
    this.testPlan = createModel(this, "plans");
    this.personalAccessToken = createModel(this, "tokens");
    this.requirementLink = createModel(this, "requirements");
    this.attachment = createModel(this, "attachments");
    this.account = createModel(this, "accounts");
    this.session = createModel(this, "sessions");
    this.verificationToken = createModel(this, "verificationTokens");
  }

  async $disconnect() {
    return undefined;
  }

  async $queryRaw() {
    throw new Error("$queryRaw is not implemented in this lightweight runtime.");
  }
}

const Prisma = {
  sql(strings, ...values) {
    let result = "";
    strings.forEach((chunk, index) => {
      result += chunk;
      if (index < values.length) {
        result += String(values[index]);
      }
    });
    return result;
  }
};

const Role = {
  ADMIN: "ADMIN",
  LEAD: "LEAD",
  TESTER: "TESTER",
  VIEWER: "VIEWER"
};

const TestStatus = {
  PASS: "PASS",
  FAIL: "FAIL",
  BLOCKED: "BLOCKED",
  SKIPPED: "SKIPPED"
};

const Priority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL"
};

module.exports = { PrismaClient, Prisma, Role, TestStatus, Priority };
