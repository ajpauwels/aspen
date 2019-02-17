const uuidv4 = require('uuid/v4');

module.exports.create = (config) => {
	const op = {};

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
			if (!op.duringChild) {
				op.duringChild = finalChild;
				finalChild.parent = op;
			} else {
				op.duringChild.addChild(finalChild);
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
			op.lastExecID = execID;
			delete op.duringChild;
			op.results = [];
		} else {
			const duringChildExecResults = await op.duringChild.exec(numTries, retryInterval, execID).catch((err) => {
				return err;
			});
			op.results = op.results.concat(duringChildExecResults);
			return duringChildExecResults;
		}

		if (!numTries) numTries = 1;
		if (!retryInterval) retryInterval = 1000;

		if (op.beforeChild) {
			const beforeResults = await op.beforeChild.exec(numTries, retryInterval, execID).catch((err) => {
				op.results = op.results.concat(err);
				throw op.results;
			});
			op.results = op.results.concat(beforeResults);
		}
		if (config.exec && typeof(config.exec) === 'function') {
			let succeeded = false;
			const execResults = [];
			for (let i = 0; i < numTries; ++i) {
				try {
					const execResult = await config.exec(numTries, retryInterval, execID);
					if (execResult) execResults.push(execResult);
					succeeded = true;
				} catch (execErr) {
					execResults.push(execErr);
				}
			}

			if (execResults.length > 0) op.results = op.results.concat(execResults);

			if (!succeeded) {
				op.inExecPhase = false;
				throw op.results;
			}
		}
		if (op.afterChild && typeof(op.afterChild) === 'object') {
			const afterResults = await op.afterChild.exec(numTries, retryInterval, execID).catch((err) => {
				op.results = op.results.concat(err);
				throw op.results;
			});
			op.results = op.results.concat(afterResults);
		}

		op.inExecPhase = false;

		return op.results;
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
		if (!execID) execID = op.lastExecID;

		let results = [];
		if (op.afterChild && typeof(op.afterChild) === 'object') {
			const afterResults = await op.afterChild.undo(numTries, retryInterval, execID).catch((err) => {
				return err;
			});
			results = results.concat(afterResults);
		}
		if (execID !== op.lastExecID) return results;
		if (config.undo && typeof(config.undo) === 'function') {
			const undoResults = await config.undo(numTries, retryInterval, execID).catch((err) => {
				return err;
			});
			results = results.concat(undoResults);
		}
		if (op.beforeChild) {
			const beforeResults = await op.beforeChild.undo(numTries, retryInterval, execID).catch((err) => {
				return err;
			});
			results = results.concat(beforeResults);
		}

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
	for (const result of resultArr) {
		if (result instanceof Error) {
			str += result.stack;
			str += '\n';
		} else {
			str += JSON.stringify(result, null, 2);
			str += '\n';
		}
	}

	return str;
};
