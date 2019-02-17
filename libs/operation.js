const uuidv4 = require('uuid/v4');

module.exports.create = (op) => {
	const execFunction = op.exec;
	const undoFunction = op.undo;

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
	 * @returns {void}
	 */
	op.addChild = (child, before, noParallel) => {
		let finalChild;
		if (Array.isArray(child)) {
			if (noParallel) {
				finalChild = child[0];
				for (let i = 1; i < child.length; ++i) {
					finalChild.addChild(child[i]);
				}
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

		if (op.inExecPhase) {
			const execID = op.execID;
			if (!op.history[execID].duringChild) {
				op.history[execID].duringChild = finalChild;
				finalChild.parent = op;
			} else {
				op.history[execID].duringChild.addChild(finalChild);
			}
			
			return op;
		}

		if (before) {
			if (op.beforeChild) {
				finalChild.addChild(op.beforeChild, true);
			}
			op.beforeChild = finalChild;
			finalChild.parent = op;
		} else {
			if (op.afterChild) {
				op.afterChild.addChild(finalChild);
			} else {
				op.afterChild = finalChild;
				finalChild.parent = op;
			}
		}

		return op;
	};

	/**
	 * Executes the operation. Accepts parameters for retrying in case of failure.
	 *
	 * @param {Number} numTries (Optional) Number of times to try the operation in case
	 *                                     it fails, defaults to 1
	 * @param {Number} retryInterval (Optional) Number of milliseconds between each retry,
	 *                                          defaults to 1000
	 * @param {String} execID Unique identifier for the chain of operations being executed
	 * @returns Promise with the results of the exec function
	 */
	op.exec = async (numTries, retryInterval, execID) => {
		if (!execID) execID = uuidv4();
		if (!op.inExecPhase) {
			op.inExecPhase = true;
			op.execID = execID;
			if (!op.history) op.history = {};
			op.history[execID] = {
				id: execID,
				results: [],
				numTries,
				retryInterval
			};
		} else {
			const duringChildExecResults = await op.history[execID].duringChild.exec(numTries, retryInterval, execID).catch((err) => {
				return err;
			});
			op.history[execID].results = op.history[execID].results.concat(duringChildExecResults);
			return duringChildExecResults;
		}

		if (!numTries) numTries = 1;
		if (!retryInterval) retryInterval = 1000;

		if (op.preBeforeHook) await op.preBeforeHook(op.history[execID], op);
		if (op.preBeforeExecOnlyHook) await op.preBeforeExecOnlyHook(op.history[execID], op);

		if (op.beforeChild) {
			op.history[execID].execBefore = true;
			const beforeResults = await op.beforeChild.exec(numTries, retryInterval, execID).catch((err) => {
				op.history[execID].results = op.history[execID].results.concat(err);
				throw op.history[execID].results;
			});
			op.history[execID].results = op.history[execID].results.concat(beforeResults);
		}

		if (op.postBeforeHook) await op.postBeforeHook(op.history[execID], op);
		if (op.postBeforeExecOnlyHook) await op.postBeforeExecOnlyHook(op.history[execID], op);
		if (op.preDuringHook) await op.preDuringHook(op.history[execID], op);
		if (op.preDuringExecOnlyHook) await op.preDuringExecOnlyHook(op.history[execID], op);

		if (execFunction && typeof(execFunction) === 'function') {
			let succeeded = false;
			const execResults = [];
			for (let i = 0; i < numTries && !succeeded; ++i) {
				try {
					const execResult = await execFunction(op.history[execID], op);
					if (execResult) execResults.push(execResult);
					succeeded = true;
				} catch (execErr) {
					execResults.push(execErr);
					await new Promise((resolv, reject) => {
						const interval = setInterval(() => {
							return resolv(interval);
						}, retryInterval);
					}).then((interval) => {
						return clearInterval(interval);
					});
				}
			}

			if (execResults.length > 0) op.history[execID].results = op.history[execID].results.concat(execResults);

			if (!succeeded) {
				op.inExecPhase = false;
				throw op.history[execID].results;
			} else {
				op.history[execID].execDuring = true;
			}
		}

		if (op.postDuringHook) await op.postDuringHook(op.history[execID], op);
		if (op.postDuringExecOnlyHook) await op.postDuringExecOnlyHook(op.history[execID], op);
		if (op.preAfterHook) await op.preAfterHook(op.history[execID], op);
		if (op.preAfterExecOnlyHook) await op.preAfterExecOnlyHook(op.history[execID], op);

		if (op.afterChild && typeof(op.afterChild) === 'object') {
			op.history[execID].execAfter = true;
			const afterResults = await op.afterChild.exec(numTries, retryInterval, execID).catch((err) => {
				op.history[execID].results = op.history[execID].results.concat(err);
				throw op.history[execID].results;
			});
			op.history[execID].results = op.history[execID].results.concat(afterResults);
		}

		if (op.postAfterHook) await op.postAfterHook(op.history[execID], op);
		if (op.postAfterExecOnlyHook) await op.postAfterExecOnlyHook(op.history[execID], op);

		op.inExecPhase = false;

		return op.history[execID].results;
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
	op.execAll = (numTries, retryInterval) => {
		if (op.parent && typeof(op.parent) === 'object') return op.parent.execAll(numTries, retryInterval);
		else return op.exec(numTries, retryInterval);
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
	op.undo = async (numTries, retryInterval, execID) => {
		if (!numTries) numTries = 1;
		if (!retryInterval) retryInterval = 1000;
		if (!execID) execID = op.execID;

		if (!op.history || !op.history[execID]) return [];

		let results = [];
		if (execID && op.history[execID].execAfter && op.afterChild && typeof(op.afterChild) === 'object') {
			if (op.postAfterUndoOnlyHook) await op.postAfterUndoOnlyHook(op.history[execID], op);
			if (op.postAfterHook) await op.postAfterHook(op.history[execID], op);
			const afterResults = await op.afterChild.undo(numTries, retryInterval, execID).catch((err) => {
				results = results.concat(err);
				throw err;
			});
			results = results.concat(afterResults);
		}

		if (op.preAfterUndoOnlyHook) await op.preAfterUndoOnlyHook(op.history[execID], op);
		if (op.preAfterHook) await op.preAfterHook(op.history[execID], op);
		if (op.postDuringUndoOnlyHook) await op.postDuringUndoOnlyHook(op.history[execID], op);
		if (op.postDuringHook) await op.postDuringHook(op.history[execID], op);

		if (execID && op.history[execID].execDuring && undoFunction && typeof(undoFunction) === 'function') {
			let succeeded = false;
			const undoResults = [];
			for (let i = 0; i < numTries && !succeeded; ++i) {
				try {
					const undoResult = await undoFunction(op.history[execID], op);
					if (undoResult) undoResults.push(undoResult);
					succeeded = true;
				} catch (undoErr) {
					undoResults.push(undoErr);
					await new Promise((resolv, reject) => {
						const interval = setInterval(() => {
							return resolv(interval);
						}, retryInterval);
					}).then((interval) => {
						return clearInterval(interval);
					});
				}
			}

			if (undoResults.length > 0) results = results.concat(undoResults);

			if (!succeeded) {
				throw results;
			}
		}

		if (op.preDuringUndoOnlyHook) await op.preDuringUndoOnlyHook(op.history[execID], op);
		if (op.preDuringHook) await op.preDuringHook(op.history[execID], op);
		if (op.postBeforeUndoOnlyHook) await op.postBeforeUndoOnlyHook(op.history[execID], op);
		if (op.postBeforeHook) await op.postBeforeHook(op.history[execID], op);

		if (execID && op.history[execID].execBefore && op.beforeChild && typeof(op.beforeChild) === 'object') {
			const beforeResults = await op.beforeChild.undo(numTries, retryInterval, execID).catch((err) => {
				results = results.concat(err);
				throw err;
			});
			results = results.concat(beforeResults);
		}

		if (op.preBeforeUndoOnlyHook) await op.preBeforeUndoOnlyHook(op.history[execID], op);
		if (op.preBeforeHook) await op.preBeforeHook(op.history[execID], op);

		return results;
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
	op.undoAll = (numTries, retryInterval) => {
		if (op.parent && typeof(op.parent) === 'object') return op.parent.undoAll(numTries, retryInterval);
		else return op.undo(numTries, retryInterval);
	};

	return op;
};

/**
 * Pretty prints a results array so that it is readable in the console.
 *
 * @param {Array} resultArr Array of results from exec or undo
 * @returns {String} Formatted string for a text file or console output
 */
module.exports.prettyPrint = (resultArr) => {
	let str = '';
	if (resultArr instanceof Error) {
		str = resultArr.stack + '\n';
	}
	else if (Array.isArray(resultArr)) {
		for (const result of resultArr) {
			if (result instanceof Error) {
				str += result.stack;
				str += '\n';
			} else {
				str += JSON.stringify(result, null, 2);
				str += '\n';
			}
		}
	}

	return str;
};
