/**
 * Waits for the given number of milliseconds.
 * Ensures the timer is cleared and the event is not
 * kept open.
 *
 * @param {Number} time Number of ms to wait
 * @return Promise
 */
module.exports.wait = (time) => {
	return new Promise((resolv, reject) => {
		const interval = setInterval(() => {
			return resolv(interval);
		}, time);
	}).then((interval) => {
		return clearInterval(interval);
	});
};
