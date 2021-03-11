# adbm
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

adbm is a simple tool for managing database migrations. It follows the UNIX philosophy of "do one thing and do it well" - therefore it does not include a CLI for creating migration files, nor does it currently sport any other bells and whistles.

In a nutshell, adbm itself will include all `.js` files from a particular directory (`migrations/` by default), see if they export an object that contains both an `up` and a `down` function and then run one of these functions (depending on whether you're migrating `up` or `down` of course).   

Since the core of adbm is database agnostic, it requires an adapter for all operations that need to persist data (such as registering successfully run migrations or retrieving the list of already applied migrations).

## Installation
```
yarn add adbm
```
To actually work with adbm you'll also need to install an adapter (unless you're rolling your own):
```
yarn add adbm-mongodb
```

## API

`adbm(db, adapter, injections) -> Function`

* `db` (*required*) Database driver instance (as returned by `await mongodb.connect()` for instance). This will be passed to all migration functions as well as all adapter functions. 
* `adapter`(*required*) Adapter object (see Adapters section).
* `injections` (optional):
  * `getMigrationObjects` (optional, default `getMigrationObjectsFromDirectory`) A function that returns an array of migration objects, i.e. objects that expose an `up` and a `down` function, as well as an `id`.
  * `metadata` (optional, default `_adbm`) Name of the table or collection containing migration metadata (i.e. the list of already applied migrations). 
  * `directory` (optional, default `migrations`) Directory containing migration files (can be relative to cwd or absolute).
  * `logger` (optional, defaults to console logging) Logger object providing `debug`, `verbose`, `info`, `warn` and `error` functions (e.g. a [winston](https://github.com/winstonjs/winston) instance).

This will return an async function which will run (or revert) available migrations. The returned function will have the following API:

`migrate({ direction, exclude }) -> Promise<Array<{ id, duration }>>`

* `direction` (optional, default `up`) Migration direction. `up` applies pending migrations (i.e. those not in the list of already applied migrations), `down` reverts migrations that have already been applied
* `exclude` (optional, default `[ ]`) List of migration ids to ignore

This function will return a promise that resolves to an array containing a list of all performed migrations.

### Example

```ts
import { adbm, getMigrationObjectsFromDirectory } from 'adbm'
import { adapter } from 'adbm-mongodb'
import { MongoClient } from 'mongodb'

export const runMigrations = async () => {
  const client = await MongoClient.connect('mongodb://localhost/myDatabase')
  const db = client.db('myDatabase')
  const migrate = adbm(db, adapter, { 
    // Here we're setting the migrations directory to a custom path. If your migrations reside in the
    // default directory ("migrations/"), you do not need to pass the third argument at all 
    getMigrationObjects: args => getMigrationObjectsFromDirectory({
      ...args,
      directory: 'custom/migrations/directory'
    })
  })
  
  const migrations = await migrate() // same as "await migrate({ direction: 'up', exclude: [] })"
  
  console.dir(migrations)
}
```

## Migration Files
All migration files must be CJS modules (ESM and TS are not currently supported) and export an object that implements both an `up` and a `down` function. Migrations are identified by their filename (i.e. `01-init-db.js` will have `01-init-db` as it's migration id) and will be executed in the order retrieved from the filesystem.

`up` and `down` methods can (and probably should) be `async` functions (they will be `await`ed) and will each receive the following parameters when they're executed:

* `db` Database driver instance (as originally passed to `adbm()`)
* `logger` Logger instance (as originally passed to `adbm()`)

### Example
```js
const id = 123
const collection = 'users'

module.exports = {
  async up (db, logger) {
    logger.info('Creating user %s', id)
    
    await db.collection(collection).insertOne({ id, name: 'Some Guy', group: 'admins' })
  },
  async down (db, logger) {
    logger.warn('Removing user %s', id)
    
    await db.collection(collection).removeOne({ id })
  }
}
```

## Adapters
Adapters are small objects that handle all database specific tasks. One adapter compatible with v2 of this library is currently available on npm: [adbm-mongodb](https://github.com/daerion/adbm-mongodb). To write your own adapter for any other dbms you'll simply need to implement the adapter API and provide your adapter object to the `adbm()` initialization function.
 
### API
#### Parameters
Adapter functions will receive a subset of the following parameters (see below for details on which function receives what): 
* `id` Migration ID
* `db` Database driver instance
* `metadata` Name of metadata table or collection
* `directory` Directory containing migration files (as passed to `adbm()`)
* `logger` Logger object

#### Functions
Adapters need to implement the following functions (all of which will propably need to be async/Promise returning):
* `init({ db, metadata, directory, logger }) -> void` Will be called before any migrations take place. Can/should be used to create the database and/or the migration metadata table if necessary.
* `getCompletedMigrationIds({ db, metadata, logger }) -> Array<String>` Expected to return an array of already applied migration IDs.
* `registerMigration({ id, db, metadata, logger }) -> void` Called upon successful completion of a migration. Should be used to store migration ID in the `metadata` table so it will be included when `getCompletedMigrationIds` is called the next time.
* `unregisterMigration({ id, db, metadata, logger }) -> void` Called when a migration has been reverted. Should be used to remove the migration ID from the list of completed migrations.
  

## Error Handling
Similar to its spiritual predecessor library [reconsider](https://github.com/daerion/reconsider), adbm does not handle any migration errors. The reasoning behind this has remained the exact same: handling migration errors would either involve too much guesswork or introduce a host of new config options for no good reason (Revert everything? Don't revert anything? Attempt to call the failed migration's down method?). It is the caller's responsibility to handle errors appropriately.

One consequence of adbm's lack of error handling is that an error in any migration will prevent all subsequent migrations from running. This, too, is intended behavior, since database migrations will more often than not rely on changes introduced by previous migrations. Since no automatic rollback is performed, and since all successful migrations will still register, `migrate()` can safely be called again once the problem has been resolved.

This should also encourage the user to write small migrations that change one thing at a time, as opposed to huge migration files that change several things at once.

## Testing
```
yarn run test
```
As of `2.0.0`, tests no longer require a connection to a mongodb server.

## Author
[Michael Smesnik](https://github.com/daerion) at [crystallize](https://crystallize.com)

## License
MIT
