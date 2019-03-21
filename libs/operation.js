// Third-party libs
const uuidv4 = require('uuid/v4');

// Local libs
const Util = require('./util');

module.exports = (op) => {
	if (!op || typeof(op) !== 'object' || Array.isArray(op)) op = {};
	if (!Array.isArray(op.history)) op.history = [];

	const execFunction = op.exec;
	const undoFunction = op.undo;

	/**
	 * Gets the data associated with the given execution context. Like the
	 * 'get' function but retrieves just the data rather than a whole handle.
	 *
	 * @param {String} execID ID of the execution context
	 * @returns {Object} Data object for the context
	 */
	op.getContext = (execID) => {
		const ctx = op.history[execID];
		if (!ctx || typeof(ctx) !== 'object') {
			const err = new Error(`No context with ID '${execID}' exists`);
			err.statusCode = 404;
			throw err;
		}

		return ctx;
	};

	/**
	 * Executes the operation defined by the given ID with the given retry options.
	 *
	 * @param {String} execID ID of the execution context
	 * @param {Number} numTries Number of tries in case of failure
	 * @param {Number} retryInterval Number of ms of interval between each retry
	 * @returns {Promise}
	 */
	op.exec = (execID, numTries, retryInterval) => {
		return op.get(execID).exec(numTries, retryInterval);
	};

	/**
	 * Creates an execution handle into the operation.
	 *
	 * @param {Any} Takes any number of params, these will be handed
	 *               to all operation-defined hook, exec, and undo functions
	 * @returns {Object} Handle to the execution context
	 */
	op.create = (...params) => {
		const execID = uuidv4();
		op.history[execID] = {
			execID,
			params
		};

		return op.get(execID);
	};

	/**
	 * Generates and returns a handle to the specified execution context.
	 *
	 * @param {String} execID ID of the context to get a handle to
	 * @returns {Object} Execution context handle
	 */
	op.get = (execID) => {
		const opInstance = {};

		opInstance.getContext = () => {
			return op.getContext(execID);
		};

		/**
		 * Getter function for the exec ID of this handle. Used to provide
		 * read-only access to the value.
		 *
		 * @returns {String} ID of this handle
		 */
		opInstance.getExecID = () => {
			return execID;
		};

		/**
		 * Adds a child to the operation. This child will either be added as a before
		 * or after child of the operation, meaning that it will execute before or after
		 * the current operation executes.
		 *
		 * @param {Object|Array} child Child or children to add
		 * @param {Boolean} before (Optional) True if this child should execute before the
		 *                                    current operation
		 * @param {Boolean} noParallel (Optional) True if the children should execute one
		 *                                        after the other rather than in parallel
		 * @returns {Object} This operation handle
		 */
		opInstance.addChild = (child, before, noParallel) => {
			let finalChild;
			if (Array.isArray(child)) {
				if (noParallel) {
					finalChild = child[0];
					child.shift();
					finalChild.addChild(child, false, noParallel);
				} else {
					finalChild = this.create(child);
				}
			}
			else if (typeof(child) === 'object') {
				finalChild = child;
			} else {
				const err = new Error(`Child must be an array or an operation, currently is '${typeof(child)}'`);
				err.statusCode = 400;
				throw err;
			}

			const ctx = op.getContext(execID);
			if (ctx.executing) {
				if (!ctx.pendingDuringChild) ctx.pendingDuringChild = child;
				else ctx.pendingDuringChild.addChild(child, before, noParallel);
				return opInstance;
			}

			if (before) {
				if (ctx.beforeChild) {
					finalChild.addChild(ctx.beforeChild, true);
				}
				ctx.beforeChild = finalChild;
				finalChild.addParent(opInstance);
			} else {
				if (ctx.afterChild) {
					ctx.afterChild.addChild(finalChild);
				} else {
					ctx.afterChild = finalChild;
					finalChild.addParent(opInstance);
				}
			}

			return opInstance;
		};

		/**
		 * Replaces the handle's current parent with a new one.
		 *
		 * @param {Object} parent Operation handle to use as parent
		 * @returns {Object} This operation handle
		 */
		opInstance.addParent = (parent) => {
			const ctx = op.getContext(execID);
			ctx.parent = parent;
			return opInstance;
		};

		/**
		 * Resets the handle and children as if they had never been executed.
		 *
		 * @returns {Object} This operation handle
		 */
		opInstance.reset = () => {
			const ctx = op.getContext(execID);
			const params = ctx.params;
			const beforeChild = ctx.beforeChild;
			const afterChild = ctx.afterChild;
			op.history[execID] = {
				execID,
				params,
				beforeChild,
				afterChild,
				execResults: [],
				phases: {}
			};

			if (ctx.beforeChild && ctx.beforeChild.reset) ctx.beforeChild.reset();
			if (ctx.afterChild && ctx.afterChild.reset) ctx.afterChild.reset();

			return opInstance;
		};

		/**
		 * Resets the entire operation tree, not just this operation and its children.
		 *
		 * @returns This execution context handle
		 */
		opInstance.resetAll = () => {
			const ctx = op.getContext(execID);
			if (ctx.parent && typeof(ctx.parent) === 'object') return ctx.parent.resetAll();
			else return opInstance.reset();
		};

		/**
		 * Executes the entire tree of operations that this operation belongs to.
		 *
		 * @param {Number} numTries (Optional) Number of times to try the operation in case
		 *                                     it fails, defaults to 1
		 * @param {Number} retryInterval (Optional) Number of milliseconds between each retry,
		 *                                          defaults to 1000
		 * @returns Promise with the results of the exec function
		 */
		opInstance.execAll = (numTries, retryInterval) => {
			const ctx = op.getContext(execID);
			if (ctx.parent && typeof(ctx.parent) === 'object') return ctx.parent.execAll(numTries, retryInterval);
			else return opInstance.exec(numTries, retryInterval);
		};

		/**
		 * Undoes the entire tree of operations that this operation belongs to.
		 *
		 * @param {Number} numTries (Optional) Number of times to try the operation in case
		 *                                     it fails, defaults to 1
		 * @param {Number} retryInterval (Optional) Number of milliseconds between each retry,
		 *                                          defaults to 1000
		 * @returns Promise with the results of the undo function
		 */
		opInstance.undoAll = (numTries, retryInterval) => {
			if (opInstance.parent && typeof(opInstance.parent) === 'object') return opInstance.parent.undoAll(numTries, retryInterval);
			else return opInstance.undo(numTries, retryInterval);
		};

		/**
		 * Executes the operation. Accepts parameters for retrying in case of failure.
		 *
		 * @param {Number} numTries (Optional) Number of times to try the operation in case
		 *                                     it fails, defaults to 1
		 * @param {Number} retryInterval (Optional) Number of milliseconds between each retry,
		 *                                          defaults to 1000
		 * @returns Promise with the results of the exec function
		 */
		opInstance.exec = async (numTries, retryInterval) => {
			if (!execID) {
				const err = new Error('Require an exec ID for context');
				err.statusCode = 400;
				throw err;
			}
			if (!numTries) numTries = 1;
			if (!retryInterval) retryInterval = 1000;

			let ctx = op.getContext(execID);
			if (!ctx.executing) {
				opInstance.reset();
				ctx = op.getContext(execID);
				ctx.executing = true;
				ctx.numTries = numTries;
				ctx.retryInterval = retryInterval;
			} else {
				if (ctx.pendingDuringChild) {
					let errOccurred;
					const duringChildExecResults = await ctx.pendingDuringChild.exec(ctx.numTries, ctx.retryInterval).then((results) => {
						ctx.execResults = ctx.execResults.concat(results);
						return results;
					}).catch((err) => {
						errOccurred = true;
						return err;
					});

					if (!ctx.duringChildren) ctx.duringChildren = {};
					if (ctx.phases.completedExecFunction) {
						if (!ctx.duringChildren.afterChild) ctx.duringChildren.afterChild = module.exports().create();
						ctx.duringChildren.afterChild.addChild(ctx.pendingDuringChild, !ctx.phases.afterChildSucceeded);
					}
					else if (ctx.phases.completedBeforeChild) {
						if (!ctx.duringChildren.duringChild) ctx.duringChildren.duringChild = module.exports().create();
						ctx.duringChildren.duringChild.addChild(ctx.pendingDuringChild, !ctx.phases.execFunctionSucceeded);
					} else {
						if (!ctx.duringChildren.beforeChild) ctx.duringChildren.beforeChild = module.exports().create();
						ctx.duringChildren.beforeChild.addChild(ctx.pendingDuringChild, !ctx.phases.beforeChildSucceeded);
					}

					ctx.pendingDuringChild = undefined;
					if (errOccurred) throw duringChildExecResults;
					else return duringChildExecResults;
				} else {
					return undefined;
				}
			}

			try {
				if (op.preBeforeHook) {
					const hookResults = await op.preBeforeHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}
				if (opInstance.preBeforeHook) {
					const hookResults = await opInstance.preBeforeHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}
				if (op.preBeforeExecOnlyHook) {
					const hookResults = await op.preBeforeExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}
				if (opInstance.preBeforeExecOnlyHook) {
					const hookResults = await opInstance.preBeforeExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}

				if (ctx.beforeChild) {
					ctx.phases.beforeChildExecuted = true;
					const beforeResults = await ctx.beforeChild.exec(numTries, retryInterval);
					ctx.phases.beforeChildSucceeded = true;
					ctx.execResults = ctx.execResults.concat(beforeResults);
					await opInstance.exec();
				}

				if (op.postBeforeHook) {
					const hookResults = await op.postBeforeHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}
				if (opInstance.postBeforeHook) {
					const hookResults = await opInstance.postBeforeHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}
				if (op.postBeforeExecOnlyHook) {
					const hookResults = await op.postBeforeExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}
				if (opInstance.postBeforeExecOnlyHook) {
					const hookResults = await opInstance.postBeforeExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}

				ctx.phases.completedBeforeChild = true;

				if (op.preDuringHook) {
					const hookResults = await op.preDuringHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}
				if (opInstance.preDuringHook) {
					const hookResults = await opInstance.preDuringHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}
				if (op.preDuringExecOnlyHook) {
					const hookResults = await op.preDuringExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}
				if (opInstance.preDuringExecOnlyHook) {
					const hookResults = await opInstance.preDuringExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
					await opInstance.exec();
				}

				if (execFunction && typeof(execFunction) === 'function') {
					ctx.opResults = [];

					for (let i = 0; i < numTries && !ctx.phases.execFunctionSucceeded; ++i) {
						ctx.duringChildren = undefined;
						ctx.phases.execFunctionAttempt = i;
						if (op.preDuringTryHook) {
							const hookResults = await op.preDuringTryHook(...ctx.params, ctx, opInstance);
							if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
							await opInstance.exec();
						}
						if (opInstance.preDuringTryHook) {
							const hookResults = await opInstance.preDuringTryHook(...ctx.params, ctx, opInstance);
							if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
							await opInstance.exec();
						}
						if (op.preDuringTryExecOnlyHook) {
							const hookResults = await op.preDuringTryExecOnlyHook(...ctx.params, ctx, opInstance);
							if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
							await opInstance.exec();
						}
						if (opInstance.preDuringTryExecOnlyHook) {
							const hookResults = await opInstance.preDuringTryExecOnlyHook(...ctx.params, ctx, opInstance);
							if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
							await opInstance.exec();
						}

						try {
							ctx.phases.execFunctionExecuted = true;
							const opResults = await execFunction(...ctx.params, ctx, opInstance);
							ctx.phases.execFunctionSucceeded = true;
							if (opResults) ctx.opResults.push(opResults);
							await opInstance.exec();
						} catch (opErr) {
							ctx.opResults.push(opErr);
							await Util.wait(retryInterval);
						}

						if (op.postDuringTryHook) {
							const hookResults = await op.postDuringTryHook(...ctx.params, ctx, opInstance);
							if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
							await opInstance.exec();
						}
						if (opInstance.postDuringTryHook) {
							const hookResults = await opInstance.postDuringTryHook(...ctx.params, ctx, opInstance);
							if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
							await opInstance.exec();
						}
						if (op.postDuringTryExecOnlyHook) {
							const hookResults = await op.postDuringTryExecOnlyHook(...ctx.params, ctx, opInstance);
							if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
							await opInstance.exec();
						}
						if (opInstance.postDuringTryExecOnlyHook) {
							const hookResults = await opInstance.postDuringTryExecOnlyHook(...ctx.params, ctx, opInstance);
							if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
							await opInstance.exec();
						}
					}

					if (ctx.phases.execFunctionSucceeded) {
						ctx.execResults = ctx.execResults.concat(ctx.opResults);
					} else {
						throw ctx.opResults;
					}
				}

				if (op.postDuringHook) {
					const hookResults = await op.postDuringHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}
				if (opInstance.postDuringHook) {
					const hookResults = await opInstance.postDuringHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}
				if (op.postDuringExecOnlyHook) {
					const hookResults = await op.postDuringExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}
				if (opInstance.postDuringExecOnlyHook) {
					const hookResults = await opInstance.postDuringExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}

				ctx.phases.completedExecFunction = true;

				if (op.preAfterHook) {
					const hookResults = await op.preAfterHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}
				if (opInstance.preAfterHook) {
					const hookResults = await opInstance.preAfterHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}
				if (op.preAfterExecOnlyHook) {
					const hookResults = await op.preAfterExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}
				if (opInstance.preAfterExecOnlyHook) {
					const hookResults = await opInstance.preAfterExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}

				if (ctx.afterChild && typeof(ctx.afterChild) === 'object') {
					ctx.phases.afterChildExecuted = true;
					const afterResults = await ctx.afterChild.exec(numTries, retryInterval);
					ctx.phases.afterChildSucceeded = true;
					ctx.execResults = ctx.execResults.concat(afterResults);
				}

				if (op.postAfterHook) {
					const hookResults = await op.postAfterHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}
				if (opInstance.postAfterHook) {
					const hookResults = await opInstance.postAfterHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}
				if (op.postAfterExecOnlyHook) {
					const hookResults = await op.postAfterExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}
				if (opInstance.postAfterExecOnlyHook) {
					const hookResults = await opInstance.postAfterExecOnlyHook(...ctx.params, ctx, opInstance);
					if (hookResults) ctx.execResults = ctx.execResults.concat(hookResults);
				}

				ctx.phases.completedAfterChild = true;

				ctx.executing = false;
				return ctx.execResults;
			} catch(err) {
				ctx.execResults = ctx.execResults.concat(err);
				ctx.executing = false;
				throw ctx.execResults;
			}
		};

		/**
		 * Undoes the operation. Accepts parameters for retrying in case of failures.
		 *
		 * @param {Number} numTries (Optional) Number of times to try the operation in case
		 *                                     it fails, defaults to 1
		 * @param {Number} retryInterval (Optional) Number of milliseconds between each retry,
		 *                                          defaults to 1000
		 * @returns Promise with the results of the undo function
		 */
		opInstance.undo = async (numTries, retryInterval) => {
			if (!numTries) numTries = 1;
			if (!retryInterval) retryInterval = 1000;

			const ctx = op.getContext(execID);
			if (ctx.undoing) {
				const err = new Error(`Cannot undo while undo is occuring in op '${execID}'`);
				err.statusCode = 409;
				throw err;
			}
			ctx.undoing = true;
			ctx.numTries = numTries;
			ctx.retryInterval = retryInterval;
			ctx.undoResults = [];

			try {
				if (op.postAfterUndoOnlyHook) await op.postAfterUndoOnlyHook(...ctx.params, ctx, opInstance);
				if (op.postAfterHook) await op.postAfterHook(...ctx.params, ctx, opInstance);

				if (ctx.duringChildren && ctx.duringChildren.afterChild && ctx.duringChildren.afterChild.getContext().afterChild) {
					const undoResults = await ctx.duringChildren.afterChild.getContext().afterChild.undo(ctx.numRetries, ctx.retryInterval);
					if (undoResults) ctx.undoResults = ctx.undoResults.concat(undoResults);
				}

				if (ctx.phases.afterChildExecuted && ctx.afterChild && typeof(ctx.afterChild) === 'object') {
					const afterChildUndoResults = await ctx.afterChild.undo(numTries, retryInterval);
					ctx.undoResults = ctx.undoResults.concat(afterChildUndoResults);
				}

				if (ctx.duringChildren && ctx.duringChildren.afterChild && ctx.duringChildren.afterChild.getContext().beforeChild) {
					const undoResults = await ctx.duringChildren.afterChild.getContext().beforeChild.undo(ctx.numRetries, ctx.retryInterval);
					if (undoResults) ctx.undoResults = ctx.undoResults.concat(undoResults);
				}

				if (op.preAfterUndoOnlyHook) await op.preAfterUndoOnlyHook(...ctx.params, ctx, opInstance);
				if (op.preAfterHook) await op.preAfterHook(...ctx.params, ctx, opInstance);
				if (op.postDuringUndoOnlyHook) await op.postDuringUndoOnlyHook(...ctx.params, ctx, opInstance);
				if (op.postDuringHook) await op.postDuringHook(...ctx.params, ctx, opInstance);

				if (ctx.duringChildren && ctx.duringChildren.duringChild && ctx.duringChildren.duringChild.getContext().afterChild) {
					const undoResults = await ctx.duringChildren.duringChild.getContext().afterChild.undo(ctx.numRetries, ctx.retryInterval);
					if (undoResults) ctx.undoResults = ctx.undoResults.concat(undoResults);
				}

				if (ctx.phases.execFunctionExecuted && ctx.phases.execFunctionSucceeded) {
					if (undoFunction && typeof(undoFunction) === 'function') {
						ctx.opUndoResults = [];
						for (let i = 0; i < numTries && !ctx.phases.undoFunctionSucceeded; ++i) {
							ctx.phases.undoFunctionAttempt = i;
							if (op.postDuringTryUndoOnlyHook) await op.postDuringTryUndoOnlyHook(...ctx.params, ctx, opInstance);
							if (op.postDuringTryHook) await op.postDuringTryHook(...ctx.params, ctx, opInstance);
							try {
								const undoResult = await undoFunction(...ctx.params, ctx, op);
								if (undoResult) ctx.opUndoResults.push(undoResult);
								ctx.phases.undoFunctionSucceeded = true;
							} catch (undoErr) {
								ctx.opUndoResults.push(undoErr);
								await Util.wait(retryInterval);
							}

							if (op.preDuringTryUndoOnlyHook) await op.preDuringTryUndoOnlyHook(...ctx.params, ctx, opInstance);
							if (op.preDuringTryHook) await op.preDuringTryHook(...ctx.params, ctx, opInstance);
						}

						if (!ctx.phases.undoFunctionSucceeded) {
							throw ctx.opUndoResults;
						} else {
							ctx.undoResults = ctx.undoResults.concat(ctx.opUndoResults);
						}
					}
				}

				if (ctx.duringChildren && ctx.duringChildren.duringChild && ctx.duringChildren.duringChild.getContext().beforeChild) {
					const undoResults = await ctx.duringChildren.duringChild.getContext().beforeChild.undo(ctx.numRetries, ctx.retryInterval);
					if (undoResults) ctx.undoResults = ctx.undoResults.concat(undoResults);
				}

				if (op.preDuringUndoOnlyHook) await op.preDuringUndoOnlyHook(...ctx.params, ctx, opInstance);
				if (op.preDuringHook) await op.preDuringHook(...ctx.params, ctx, opInstance);
				if (op.postBeforeUndoOnlyHook) await op.postBeforeUndoOnlyHook(...ctx.params, ctx, opInstance);
				if (op.postBeforeHook) await op.postBeforeHook(...ctx.params, ctx, opInstance);

				if (ctx.duringChildren && ctx.duringChildren.beforeChild && ctx.duringChildren.beforeChild.getContext().afterChild) {
					const undoResults = await ctx.duringChildren.beforeChild.getContext().afterChild.undo(ctx.numRetries, ctx.retryInterval);
					if (undoResults) ctx.undoResults = ctx.undoResults.concat(undoResults);
				}

				if (ctx.phases.beforeChildExecuted && ctx.beforeChild && typeof(ctx.beforeChild) === 'object') {
					const beforeChildUndoResults = await ctx.beforeChild.undo(numTries, retryInterval);
					ctx.undoResults = ctx.undoResults.concat(beforeChildUndoResults);
				}

				if (ctx.duringChildren && ctx.duringChildren.beforeChild && ctx.duringChildren.beforeChild.getContext().beforeChild) {
					const undoResults = await ctx.duringChildren.beforeChild.getContext().beforeChild.undo(ctx.numRetries, ctx.retryInterval);
					if (undoResults) ctx.undoResults = ctx.undoResults.concat(undoResults);
				}

				if (op.preBeforeUndoOnlyHook) await op.preBeforeUndoOnlyHook(...ctx.params, ctx, opInstance);
				if (op.preBeforeHook) await op.preBeforeHook(...ctx.params, ctx, opInstance);

				ctx.undoing = false;
				return ctx.undoResults;
			} catch(err) {
				ctx.undoResults = ctx.undoResults.concat(err);
				ctx.undoing = false;
				throw ctx.undoResults;
			}
		};

		return opInstance;
	};

	return op;
};

/**
 * Pretty prints a results array so that it is readable in the console.
 *
 * @param {Array} resultArr Array of results from exec or undo
 * @returns {String} Formatted string for a text file or console output
 */
// module.exports.prettyPrint = (resultArr) => {
// 	let str = '';
// 	if (resultArr instanceof Error) {
// 		str = resultArr.stack + '\n';
// 	}
// 	else if (Array.isArray(resultArr)) {
// 		for (const result of resultArr) {
// 			if (result instanceof Error) {
// 				str += result.stack;
// 				str += '\n';
// 			} else {
// 				str += JSON.stringify(result, null, 2);
// 				str += '\n';
// 			}
// 		}
// 	}

// 	return str;
// };
