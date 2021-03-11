# Changelog

## 2021-03-11 `v2.0.0`
### Breaking Changes
* `[SEMVER_MAJOR]` Restructured `adbm` factory arguments: now uses three positional arguments - `db`, `adapter` and `injections`. The latter can be used to inject various functions into the factory, chief among them the function used to retrieve migration objects.
* `[SEMVER_MAJOR]` Renamed `getMigrationObjects` to `getMigrationObjectsFromDirectory`

### Changed
* `[SEMVER_MINOR]` Refactored library to typescript

## 2019-08-15 `v1.2.0`
* `[SEMVER_MINOR]` replaced all calls to `logger.verbose` with `logger.debug`
* `[SEMVER_PATCH]` updated dependencies

## 2018-03-28 `v1.1.2`
* `[SEMVER_PATCH]` migrations will now be run in reverse order when migrating down (as was always the intention)

## 2017-04-24 `v1.1.0`
* `[SEMVER_MINOR]` Added `dbName` param

## 2017-04-24 `v1.0.0`
* Initial release
