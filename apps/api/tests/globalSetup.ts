import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * Boots ONE in-memory replica set for the whole suite. A replica set (not a
 * standalone) is mandatory: reservationService (M3) runs inside
 * session.withTransaction, and Mongo only supports transactions on a replica
 * set. `count: 1` is enough — we need the oplog, not real replication.
 *
 * Sharing one server across every test file also kills the M2 flake: booting a
 * separate mongod per file saturated CPU/IO under Vitest's default pool.
 */

let replSet: MongoMemoryReplSet;

const setup = async (): Promise<void> => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGO_TEST_URI = replSet.getUri();
};

const teardown = async (): Promise<void> => {
  await replSet.stop();
};

export { setup, teardown };
