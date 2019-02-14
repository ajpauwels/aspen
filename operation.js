module.exports = function(opBody, description) {
	if (Array.isArray(opBody)) return new ParallelOperation(opBody, description);
	else return new Operation(opBody, description);
};

function Operation(opBody, description) {
	
}

function ParallelOperation(opBody, description) {
	if (!Array.isArray(opBody)) {
		const err = new Error('\'opBody\' must be an array to make a parallel operation');
		err.statusCode = 400;
		throw err;
	}

	const exec = async () => {

	};

	return new Operation({
		exec,
		undo
	})
}
