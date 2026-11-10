'use strict';

// bluebird schedules its "possibly unhandled rejection" detection on a
// setTimeout, independent of Node's native unhandledRejection handling. In
// this suite several tests intentionally create rejected bluebird promises
// (validation-error paths, latent-bug "never settles" tests) without a
// synchronous .catch. When bluebird's internal check fires and no
// `process` listener is registered for 'unhandledRejection', it falls back
// to logging "Unhandled rejection ..." directly to the console
// (debuggability.js: fireRejectionEvent -> formatAndLogError). On
// slower/CI machines that console write can land after Jest has already
// torn down that test file's console interception, producing a
// "Cannot log after tests are done" failure and a non-zero CI exit code.
//
// Registering a listener here makes process.emit('unhandledRejection', ...)
// report as handled, suppressing bluebird's console fallback without
// altering any promise resolution/rejection behavior under test.
process.on('unhandledRejection', function () {});
