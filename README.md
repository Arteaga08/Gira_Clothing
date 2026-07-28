# Gira_Clothing

## Mongo local como replica set (requerido desde M3)

Las transacciones de Mongo solo existen en replica set. Una sola vez:

```bash
mongod --replSet rs0 --dbpath /usr/local/var/mongodb
mongosh --eval 'rs.initiate()'
```

Y en `.env.development.local`:

```
MONGODB_URI=mongodb://127.0.0.1:27017/gira-dev?replicaSet=rs0
```

Los tests no necesitan nada: `MongoMemoryReplSet` lo arranca solo.
