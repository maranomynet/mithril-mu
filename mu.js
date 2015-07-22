/*
  µ (mu) is an unobtrusive, lightweight function wrapper around
  mithril's `m()` function. It also exposes a few utility functions.

  `µ()` is a drop-in replacement for `m()` adding these features:

    * Support for custom attribute transormations (similar to Barney Carroll's `mattr`)
      (add your own via `µ.attrs.customAttr = myTransformFn`)
    * Binds DOM events via `.addEventListener()` when neccessary.
    * Allows opting-out of element wrapping via `µ( cond?'.wrapper':null, m('p','content') )`

  Usage:

      var m = require('mithril');
      var µ = require('./mu.js')(m, myAttrTransforms);
      console.log( µ.attrs === myAttrTransforms ); // true

      // ... then use µ() in place of m() where super-powers are needed.


  Utilities:

    * `µ.attrs` –
      container for your attitbute transformer functions, like so:

          µ.attrs.foobar = function (vElm, foobarAttrValue, attrs) {
              attrs.onclick = function (e) { alert('Foobar!'); };
              console.log( attrs === vElm.attrs ); // -> true
            };

    * `µ.transform( vElm )` –
      Performs post-hoc transformation on existing vElms.

          var vanillaElm = m('p', { ontransitionend:myFunc }, 'Content');
          var shinyElm = µ.transform( vanillaElm );

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

    * `µ.click( func[e], noRedraw )` –
      Wraps `func` in an event handler, doing `e.preventDefault()`
      and optionally setting `m.redraw.strategy('none')`

*/

var µNoop = function(){};

module.exports = function(m, transformers){
  transformers = transformers || {};


  // Safe adding of config functions to vElm.attrs
  var onBuild = function (vElm, configFn) {
          var oldConfigFn = vElm.attrs.config;
          vElm.attrs.config = oldConfigFn  &&  oldConfigFn !== µNoop ?
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
          attrs.config = oldConfigFn  &&  oldConfigFn !== µNoop ?
              function ( elm, isRedraw, ctx ) {
                  oldConfigFn  &&  oldConfigFn( elm, isRedraw, ctx );
                  configFn( elm, isRedraw, ctx );
                }:
              configFn;
        };

  // Safely add onunload funcs to an vElm's ctx
  var onUnload = function (vElm_or_ctx, callback) {
          var vElm = (vElm_or_ctx.tag  &&  vElm_or_ctx.attrs)  ?  vElm_or_ctx : null;
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

  // Sugar to quickly return a event handler that does
  // .preventDefault() and optionally halts redraw
  var makeClickHandler = function (fn, noRedraw) {
          return function (e) {
              e.preventDefault();
              noRedraw && m.redraw.strategy('none');
              fn.call(this, e);
            };
        };


  // Internal function to quickly bind DOM Level 2 events.
  var addEventListenerOnConfig = function (vElm, attr) {
          var evts = vElm.µEvents;
          var evtNames = vElm.µEventNames;
          if ( !evts )
          {
            evts = vElm.µEvents = {};
            evtNames = vElm.µEventsNames = '';
            onRedraw(vElm, function (elm, isRedraw, ctx) {
                if ( evtNames !== ctx.µLastEventNames )
                {
                  var lastEvts = ctx.µLastEvents || {};
                  var type;
                  // Look for deleted event attributes
                  for (type in lastEvts)
                  {
                    if ( !evts[type] )
                    {
                      elm.removeEventListener( type, lastEvts[type].handler );
                    }
                  }
                  // look for new event attributes;
                  for (type in evts)
                  {
                    if ( !lastEvts[type] )
                    {
                      evts[type].handler = (function(evAttr){
                          return function (e) { this[evAttr](e); };
                       })(evts[type].attr);
                      elm.addEventListener( type, evts[type].handler );
                    }
                  }
                  ctx.µLastEvents = evts;
                  ctx.µLastEventNames = evtNames;
                }
              });
          }
          evts[ attr.substr(2) ] = { attr:attr };
          evtNames += attr+',';
        };



  var docElm = document.documentElement;

  var transform = function (vElm) {
          var attrs = vElm.attrs;
          var attrName;
          // Look for custom attributes and run µ.attrs transformers,
          // with the same signatures expected by Barney Carroll's mattr library
          // (https://github.com/barneycarroll/mattr/blob/master/index.js)
          for (attrName in attrs)
          {
            var attrValue = attrs[attrName];
            if ( transformers[attrName]  &&  attrValue != null )
            {
              // Delete transformed attributes - to avoid custom-attribute gunk
              // accidentally polluting the DOM.
              // Transformers must explicitly re-assign their own attribute value
              // if they want to see it in the DOM.
              // NOTE: This deviates from Barney Carroll's mattr behaviour.
              delete attrs[attrName];
              // run the transformation.
              var replacement = transformers[attrName](vElm, attrValue, attrs);
              // Allow attribute transformers to return a new element
              // (or text-node or a subtree:retain directive).
              // and thus opt out of the current transformation process
              if ( replacement !== undefined )
              {
                // NOTE: Here, again, we deviate from Barney Carroll's mattr
                // - which blindly continues the loop
                return replacement;
                // vElm = replacement;
              }
              // CAVEAT: attributes added by transformers functions
              // will not be transformed -
              // with the notable exception of on{event} attributes.)
            }
          }
          // Properly bind event types that require DOM Level 2 event binding
          // See: https://github.com/lhorie/mithril.js/issues/574
          // (NOTE: do this in separate loop as custom attribute
          // handlers might have added new event handlers.)
          for (attrName in attrs)
          {
            if (
                // value is trueey
                attrs[attrName]  &&
                // not safe as DOM Level 0 event
                !( attrName in docElm )  &&
                // actually starts with 'on' (checked last to minimize cycles)
                attrName.substr(0,2)==='on'
              )
            {
              addEventListenerOnConfig( vElm, attrName );
            }
          }

          // DOM Level 2 event supprt requires dynamically adding a config function.
          // If such event attributes are added after the element was first initialized
          // it may result in a config function appearing all of a sudden, and thereby
          // throwing Mithril's diff engine into total rewrite/rebuild of the DOM element.
          // And accidental/sporadic rebuilds kill pretty CSS transformations.
          // Thus we bind this no-op function by default.
          attrs.config = attrs.config || µNoop;

          return vElm;
        };

  var µ = function (tagName) {
          var vElm = m.apply(undefined, arguments);
          // allow m(null, ...) to produce no wrapper element (instead of 'div')
          // and only return its child-nodes as an Array.
          // https://github.com/lhorie/mithril.js/issues/723
          return tagName === null ? vElm.children : transform( vElm );
        };

  // Expose transformers to allow users to add their own.
  µ.attrs = transformers;
  // Expose transform to allow post-hoc transformations of existing vElms
  µ.transform = transform;
  // Expose sugar
  µ.onBuild = onBuild;
  µ.onRedraw = onRedraw;
  µ.onUnload = onUnload;
  µ.onEvent = onEvent;
  µ.click = makeClickHandler;

  return µ;

};
