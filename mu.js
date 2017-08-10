/* Mithril µ/mu wrapper --  ©2015 Hugsmiðjan ehf.   @license MIT/GPL */
// Dual licensed under a MIT licence (http://en.wikipedia.org/wiki/MIT_License)
// and GPL 2.0 or above (http://www.gnu.org/licenses/old-licenses/gpl-2.0.html).

module.exports = function (m, transformers) {
  transformers = transformers || {};

  var transform = function (vnode) {
    var attrs = vnode.attrs;
    var attrName;
    // Look for custom attributes and run µ.attrs transformers,
    // with the same signatures expected by Barney Carroll's mattr library
    // (https://github.com/barneycarroll/mattr/blob/master/index.js)
    for (attrName in transformers) {
      if ( attrName in attrs ) {
        var attrValue = attrs[attrName];
        // Delete transformed attributes - to avoid custom-attribute gunk
        // accidentally polluting the DOM.
        // Transformers must explicitly re-assign their own attribute value
        // if they want to see it in the DOM.
        // NOTE: This deviates from Barney Carroll's mattr behaviour.
        delete attrs[attrName];
        // run the transformation.
        var transformer = transformers[attrName];
        var returnedVnode = transformer(vnode, attrValue, attrs);
        // Allow attribute transformers to return a new element
        // (or text-node or a subtree:retain directive).
        // and thus opt out of the current transformation process
        if ( returnedVnode !== undefined  &&  returnedVnode !== vnode ) {
          // NOTE: Here, again, we deviate from Barney Carroll's mattr
          // - which blindly continues the loop
          return returnedVnode;
          // vnode = returnedVnode;
        }
        // CAVEAT: attributes added by transformers functions
        // will not be transformed -
      }
    }
    return vnode;
  };

  var µ = function () {
    return transform( m.apply(undefined, arguments) );
  };

  // Expose transformers to allow users to add their own.
  µ.attrs = transformers;
  // Expose transform to allow post-hoc transformations of existing vnodes
  µ.transform = transform;

  return µ;

};
