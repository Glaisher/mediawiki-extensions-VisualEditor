/*!
 * VisualEditor MediaWiki TargetLoader.
 *
 * @copyright 2011-2015 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 */

/**
 * Target loader.
 *
 * Light-weight loader that loads ResourceLoader modules for VisualEditor
 * and HTML and page data from the API. Also handles plugin registration.
 *
 * @class mw.libs.ve.targetLoader
 * @singleton
 */
( function () {
	var prefName, prefValue,
		conf = mw.config.get( 'wgVisualEditorConfig' ),
		pluginCallbacks = [],
		modules = [
			'ext.visualEditor.mwcore',
			'ext.visualEditor.mwlink',
			'ext.visualEditor.data',
			'ext.visualEditor.mwreference',
			'ext.visualEditor.mwtransclusion',
			'ext.visualEditor.language',
			'ext.visualEditor.icons'
		]
			// Add modules from $wgVisualEditorPluginModules
			.concat( conf.pluginModules );

	// Add preference modules
	for ( prefName in conf.preferenceModules ) {
		prefValue = mw.user.options.get( prefName );
		// Check "0" (T89513)
		if ( prefValue && prefValue !== '0' ) {
			modules.push( conf.preferenceModules[prefName] );
		}
	}

	mw.libs.ve.targetLoader = {
		/**
		 * Add a plugin module or callback.
		 *
		 * If a module name is passed, that module will be loaded alongside the other modules.
		 *
		 * If a callback is passed, it will be executed after the modules have loaded. The callback
		 * may optionally return a jQuery.Promise; if it does, loading won't be complete until
		 * that promise is resolved.
		 *
		 * @param {string|Function} plugin Plugin module name or callback
		 */
		addPlugin: function ( plugin ) {
			if ( typeof plugin === 'string' ) {
				modules.push( plugin );
			} else if ( $.isFunction( plugin ) ) {
				pluginCallbacks.push( plugin );
			}
		},

		/**
		 * Load modules needed for VisualEditor, as well as plugins.
		 *
		 * This loads the base VE modules as well as any registered plugin modules.
		 * Once those are loaded, any registered plugin callbacks are executed,
		 * and we wait for all promises returned by those callbacks to resolve.
		 *
		 * @return {jQuery.Promise} Promise resolved when the loading process is complete
		 */
		loadModules: function () {
			var modulesPromise = mw.loader.using( modules ),
				userSitePromise = mw.loader.using( [ 'user', 'site' ] )
					// If the user and site modules fail, we still want to continue loading,
					// so convert failure to success
					.then( null, function () {
						return $.Deferred().resolve();
					} );

			ve.track( 'trace.moduleLoad.enter' );
			return $.when( modulesPromise, userSitePromise )
				.then( function () {
					ve.track( 'trace.moduleLoad.exit' );
					pluginCallbacks.push( ve.init.platform.getInitializedPromise.bind( ve.init.platform ) );
					// Execute plugin callbacks and collect promises
					return $.when.apply( $, pluginCallbacks.map( function ( callback ) {
						return callback();
					} ) );
				} );
		},

		/**
		 * Request the page HTML and various metadata from the MediaWiki API and Parsoid.
		 * @return {jQuery.Promise} Abortable promise resolved with a JSON object
		 */
		requestPageData: function ( pageName, oldid ) {
			var start, xhr,
				data = {
					action: 'visualeditor',
					paction: 'parse',
					page: pageName,
					uselang: mw.config.get( 'wgUserLanguage' )
				};

			// Only request the API to explicitly load the currently visible revision if we're restoring
			// from oldid. Otherwise we should load the latest version. This prevents us from editing an
			// old version if an edit was made while the user was viewing the page and/or the user is
			// seeing (slightly) stale cache.
			if ( oldid !== undefined ) {
				data.oldid = oldid;
			}
			// Load DOM
			start = ve.now();
			ve.track( 'trace.domLoad.enter' );

			xhr = new mw.Api().get( data );
			return xhr.then( function ( data, jqxhr ) {
				ve.track( 'mwtiming.performance.system.domLoad', {
					bytes: $.byteLength( jqxhr.responseText ),
					duration: ve.now() - start,
					cacheHit: /hit/i.test( jqxhr.getResponseHeader( 'X-Cache' ) ),
					parsoid: jqxhr.getResponseHeader( 'X-Parsoid-Performance' )
				} );
				ve.track( 'trace.domLoad.exit' );
				return data;
			} ).promise( { abort: xhr.abort } );
		}
	};
}() );
