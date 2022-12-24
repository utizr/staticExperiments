/*!
 * Apply a CSS animation to an element
 * (c) 2021 Chris Ferdinandi, MIT License, https://gomakethings.com
 * @param  {Node}     node      The element to animate
 * @param  {String}   animation The animation class to apply
 * @param  {Function} onEnd     A callback function to run when the animation ends [optional]
 */
function animate(node, animation, onEnd = function () {}) {
	node.classList.add(animation);
	node.addEventListener('animationend', function () {
		node.classList.remove(animation);
		onEnd(node, animation);
	}, {once: true});
}