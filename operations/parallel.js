const Operation = require('../libs/operation');

module.exports = Operation({
	preDuringExecOnlyHook: async (opArr, ctx) => {
		if (!Array.isArray(opArr)) {
			const err = new Error('Input must be an array of operations');
			err.statusCode = 400;
			throw err;
		}

		const opPromises = [];
		let errorOccurred = false;
		for (const op of opArr) {
			opPromises.push(op.exec(ctx.numTries, ctx.retryInterval).catch((err) => {
				errorOccurred = true;
				return err;
			}));
		}

		return Promise.all(opPromises).then((results) => {
			let concatResults = [];

			for (const result of results) {
				concatResults = concatResults.concat(result);
			}

			if (errorOccurred) throw concatResults;
			else return concatResults;
		});
	},
	preDuringUndoOnlyHook: async (opArr, ctx) => {
		if (!Array.isArray(opArr)) {
			const err = new Error('Input must be an array of operations');
			err.statusCode = 400;
			throw err;
		}

		const undoPromises = [];
		let errorOccurred = false;
		for (const op of opArr) {
			undoPromises.push(op.undo(ctx.numTries, ctx.retryInterval).catch((err) => {
				errorOccurred = true;
				return err;
			}));
		}

		return Promise.all(undoPromises).then((results) => {
			let concatResults = [];

			for (const result of results) {
				concatResults = concatResults.concat(result);
			}

			if (errorOccurred) throw concatResults;
			else return concatResults;
		});
	}
});
