# µ (mu)

µ is an unobtrusive, lightweight function wrapper around
mithril's `m()` function.

`µ()` is a drop-in replacement for `m()` adding these features:

  * Support for custom attribute transformations (similar to Barney Carroll's [`mattr`][1]).
  * Binds DOM events via `.addEventListener()` when [neccessary][2].
  * Allows [opting-out of element wrapping][3] via `µ( cond?'.wrapper':null, m('p','content') )`

[1]: https://github.com/barneycarroll/mattr
[2]: https://github.com/lhorie/mithril.js/issues/574
[3]: https://github.com/lhorie/mithril.js/issues/723

It also exposes a few utility functions (see below)

## Install:

```sh
npm install mithril-mu
```


## Usage:

```js
var m = require('mithril');
var µ = require('mithril-mu')(m, myAttrTransforms);
console.log( µ.attrs === myAttrTransforms ); // true

// ... then use `µ()` in place of `m()` where super-powers are needed.
```

### Adding transformations:

```js
// Post-hoc addition
µ.attrs.foobar = function (vElm, foobarAttrValue, attrs) {
    var onclick = attrs.onclick;
    attrs.onclick = function (e) {
        if (onclick) { onclick.call(this, e); }
        alert('Hello ' + foobarAttrValue + '!');
        e.preventDefault();
    };
    console.log( attrs === vElm.attrs ); // -> true
  };
// (https://www.npmjs.com/package/m.attrs.bidi)
µ.attrs.bidival = require('m.attrs.bidi');
```
  
...Then in your views:

```js
var myView = function ( ctrl ) {
    return µ('div.box', {
            foobar: 'World',
            onclick: function (e) { alert('Hi all!'); }
        }, [
            'Foobar enhanced element',
            m('p', 'Normal mithril too'),
            µ('input' { bidival:ctrl.inputText })
        ]);
};
```

In which `div.box` will alert first 'Hi all!' and then 'Hello World!' when clicked, and the `<input>` will automatically have the value `ctrl.inputText`, and update it on input.

**Notes:**

 1. The transformed attribute is removed from the virtual element's `attrs` map to keep the rendered DOM as clean as possible. If you do want the attribute to appear in the DOM, you must explicitly add it back to the `attrs` object – like so:

    ```js
    µ.attrs.onclick = function (vElm, handler, attrs) {
        // log all onclick handlers
        console.log( 'binding', handler, ' to ', vElm );
        attrs.onclick = handler;
    }
    ```

 2. A Transformation function may return a value other than `undefined`, which instantly replaces the original virtual element, and no further processing is performed. (See [discussion][4].) Thus you should avoid writing transformations that cause immediate side-effects outside the virtual-element itself or its `attrs`, as the virtual-element might never land in the DOM, or have it's `onunload` called.

[4]: https://github.com/barneycarroll/mattr/issues/2

##  Utilities:

µ comes with a few helpful utilities:

  * **`µ.transform( vElm )`** <br/>
    Performs post-hoc attr transformation, and DOM Level 2 binding on existing vElms.

    ```js
        var vanillaElm = m('p', { ontransitionend:myFunc }, 'Content');
        var shinyElm = µ.transform( vanillaElm );
    ```

  * **`µ.onUnload( vElm_or_ctx, callback[] )`** <br/>
    Safely queues `callback` for execution on `ctx.onunload`

  * **`µ.onBuild( vElm, configFn[elm,isRedraw,ctx] )`** <br/>
    Safely queues `configFn` for execution via `vElm.attrs.config`
    when `isRedraw === false` (on element initialization)

  * **`µ.onRedraw( vElm, configFn[elm,isRedraw,ctx] )`** <br/>
    Safely queues `configFn` for execution via `vElm.attrs.config` 
    on every m.redraw()

  * **`µ.addEvent( vElm_or_ctx, target, eventType, handler[e] )`** <br/>
    Sugar to bind `handler` to `eventType` on `target` and automatically
    unbind it on `ctx.onunload`.

  * **`µ.click( func[e], noRedraw )`** <br/>
    Sugar to wrap a plain `func` as an event handler, doing 
    `e.preventDefault()` and optionally setting `m.redraw.strategy('none')`

