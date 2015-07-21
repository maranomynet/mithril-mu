/*
  Mu is an unobtrusive, lightweight function wrapper for
  mithril's `m()` function, and exposes a few utility functions.

  `µ()` provides:
    * Support for custom attribute transormations (similar to Barney Carroll's `mattr`)
      (add your own via `µ.attrs.customAttr = myTransformFn`)
    * Binds all (non-white-listed) DOM events via `.addEventListener()`.
    * Allows opting-out of element wrapping via `µ( cond?'.wrapper':null, m('p','content') )`

  Utilities:

    * `µ.attrs` –
      container for attitbute value transformer functions.

    * `µ.onUnload( vElm_or_ctx, callback[] )` –
      Safely queues `callback` for execution on `ctx.onunload`

    * `µ.onBuild( vElm, configFn[elm,isRedraw,ctx] )` –
      Safely queues `configFn` for execution via `vElm.attrs.config`
      when `isRedraw === false` (on element initialization)

    * `µ.onRedraw( vElm, configFn[elm,isRedraw,ctx] )` –
      Safely queues `configFn` for execution via `vElm.attrs.config`
      on every m.redraw()

    * `µ.addEvent( vElm_or_ctx, target, eventType, handler[e] )` –
      Binds `handler` to `eventType` on `target` and
      automatically unbind them on `ctx.onunload`

  Usage:
  
      var m = require('mithril');
      var µ = require('./mu.js')(m);
      // ... then use µ() in place of m() where super-powers are required.

*/
module.exports = function(m){

  // Safe adding of config functions to vElm.attrs
  var onBuild = function (vElm, configFn) {
          var oldConfigFn = vElm.attrs.config;
          vElm.attrs.config = oldConfigFn ?
              function ( elm, isRedraw, ctx ) {
                  oldConfigFn( elm, isRedraw, ctx );
                  !isRedraw  &&  configFn( elm, isRedraw, ctx );
                }:
              function ( elm, isRedraw, ctx ) {
                  !isRedraw  &&  configFn( elm, isRedraw, ctx );
                };
        };
  var onRedraw = function (vElm, configFn) {
          var attrs = vElm.attrs;
          var oldConfigFn = attrs.config;
          attrs.config = oldConfigFn ?
              function ( elm, isRedraw, ctx ) {
                  oldConfigFn  &&  oldConfigFn( elm, isRedraw, ctx );
                  configFn( elm, isRedraw, ctx );
                }:
              configFn;
        };

  // Safely add onunload funcs to an vElm's ctx
  var onUnload = function (vElm_or_ctx, callback) {
          var vElm = vElm_or_ctx.tag  &&  vElm_or_ctx.attrs  &&  vElm_or_ctx;
          if ( vElm )
          {
            onBuild(vElm, function(e, r, ctx) {
                onUnload(ctx, callback);
              });
          }
          else
          {
            var ctx = vElm_or_ctx;
            var unloads = ctx.onunload && ctx.onunload.µ;
            if ( !unloads )
            {
              unloads = [];
              if ( ctx.onunload )
              {
                unloads[unloads.length] = ctx.onunload;
              }
              ctx.onunload = function () {
                  for (var i=0, ulFn; (ulFn = unloads[i]); i++)
                  {
                    ulFn.call(this);
                  }
                };
              ctx.onunload.µ = unloads;
            }
            unloads[unloads.length] = callback;
          }
        };

  // Sugar function to add DOM events to target objects/nodes
  // and remove them when the source element is unloaded
  var onEvent = function (vElm_or_ctx, target, eventType, handler, useCapture) {
          target.addEventListener(eventType, handler, useCapture);
          onUnload(vElm_or_ctx, function(){
              target.removeEventListener(eventType, handler, useCapture);
            });
        };



  // FIXME: add more "safe-for-DOM-level-0" events to this list
  var domLevel0 = ('click,dblclick,mouseover,mousedown,mousemove,focus,blur,'+
                   'keyup,keydown,keypress,submit,reset,scroll,change').split(',');
  // Look-up object with names of domLevel0 events that don't require .addEventListener() binding
  var skipEvents = {};
  for (var i=0, type; (type = domLevel0[i]); i++) {  skipEvents['on'+type] = true;  }


  // Internal function to quickly bind DOM Level 2 events.
  var addEventListenerOnConfig = function (vElm, attr) {
          var evts = vElm.µEvents;
          if ( !evts )
          {
            evts = vElm.µEvents = {};
            onBuild(vElm, function (elm) {
                for (var type in evts)
                {
                  var attr = evts[type];
                  // Use the handler that has been properly `autoredraw`-ified
                  // by Mithril's DOM builder
                  var handler = elm[attr];
                  elm.addEventListener( type, handler );
                  // Remove the element attribute/property to avoid double triggering
                  elm[attr] = undefined;
                  // evts[type] = handler;
                }
              /*
                // FIXME: Is unbinding still needed to guard against memory leaks
                // in the post IE8 world...?
                onUnload(ctx, function () {
                    for (var type in evts)
                    {
                      elm.removeEventListener( type, evts[type] );
                    }
                  });
              */
              });
          }
          evts[ attr.substr(2) ] = attr;
        };




  // Add custom attribute handlers here....
  var attrHandlers = {
        /*
          foobar: function (vElm, foobarAttrValue, attrs) {
              attrs.onclick = function (e) { alert('Foobar!'); };
              console.log( attrs === vElm.attrs ); // -> true
            },
        */
        };


  var µ = function (tagName) {
          var vElm = m.apply(undefined, arguments);
          if ( tagName === null )
          {
            // allow m(null, ...) to produce no wrapper element (instead of 'div')
            // and only return its child-nodes as an Array.
            // https://github.com/lhorie/mithril.js/issues/723
            vElm = vElm.children;
          }
          else
          {
            var attrName;
            // Look for custom attributes and run µ.attrs transformers,
            // with the same signatures expected by Barney Carroll's mattr library
            // (https://github.com/barneycarroll/mattr/blob/master/index.js)
            for (attrName in vElm.attrs)
            {
              var attrValue = vElm.attrs[attrName];
              if ( attrHandlers[attrName]  &&  attrValue != null )
              {
                // Delete transformed attributes - to avoid custom-attribute gunk
                // accidentally polluting the DOM.
                // Transformers must explicitly re-assign their own attribute value
                // if they want to see it in the DOM.
                delete vElm.attrs[attrName];
                // run the transformation.
                var replacement = attrHandlers[attrName](vElm, attrValue, vElm.attrs);
                // Allow attribute transformers to return a completely new element.
                // This is scary/weird/unpredictable but left in to support
                // the same transformers as Barney Carroll's mattr library
                if ( replacement !== undefined )
                {
                  vElm = replacement;
                }
                // CAVEAT: attributes added by transformers functions
                // will not be transformed. (Except on{event} attributes.)
              }
            }
            // Properly bind event types that require DOM Level 2 event binding
            // See: https://github.com/lhorie/mithril.js/issues/574
            // (NOTE: do this in separate loop as custom attribute
            // handlers might have added new event handlers.)
            for (attrName in vElm.attrs)
            {
              if (
                  // not listed as safe for mithril's simplistic event property handling
                  !skipEvents[attrName]  &&
                  // not handled already by custom transformation above.
                  !attrHandlers[attrName]  &&
                  // starts with 'on'
                  attrName.substr(0,2)==='on'
                )
              {
                addEventListenerOnConfig( vElm, attrName, vElm.attrs[attrName] );
              }
            }
          }
          return vElm;
        };

  // Expose attrHandlers to allow users to add their own.
  µ.attrs = attrHandlers;
  // Expose onUnload and onBuild functions
  µ.onUnload = onUnload;
  µ.onBuild = onBuild;
  µ.onRedraw = onRedraw;
  µ.onEvent = onEvent;

  return µ;

};
