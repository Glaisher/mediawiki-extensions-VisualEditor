/*
 * VisualEditor user interface MWTemplateDialog class.
 *
 * @copyright 2011-2015 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 */

/**
 * Dialog for inserting and editing MediaWiki transclusions.
 *
 * @class
 * @abstract
 * @extends ve.ui.NodeDialog
 *
 * @constructor
 * @param {Object} [config] Configuration options
 */
ve.ui.MWTemplateDialog = function VeUiMWTemplateDialog( config ) {
	// Parent constructor
	ve.ui.MWTemplateDialog.super.call( this, config );

	// Properties
	this.transclusionModel = null;
	this.loaded = false;
	this.altered = false;
	this.preventReselection = false;
	this.expandedParamList = {};

	this.confirmOverlay = new ve.ui.Overlay( { classes: ['ve-ui-overlay-global'] } );
	this.confirmDialogs = new ve.ui.WindowManager( { factory: ve.ui.windowFactory, isolate: true } );
	this.confirmOverlay.$element.append( this.confirmDialogs.$element );
	$( 'body' ).append( this.confirmOverlay.$element );
};

/* Inheritance */

OO.inheritClass( ve.ui.MWTemplateDialog, ve.ui.NodeDialog );

/* Static Properties */

ve.ui.MWTemplateDialog.static.icon = 'template';

ve.ui.MWTemplateDialog.static.modelClasses = [ ve.dm.MWTransclusionNode ];

ve.ui.MWTemplateDialog.static.actions = [
	{
		action: 'apply',
		label: OO.ui.deferMsg( 'visualeditor-dialog-action-apply' ),
		flags: [ 'progressive', 'primary' ],
		modes: 'edit'
	},
	{
		action: 'insert',
		label: OO.ui.deferMsg( 'visualeditor-dialog-action-insert' ),
		flags: [ 'primary', 'constructive' ],
		modes: 'insert'
	},
	{
		label: OO.ui.deferMsg( 'visualeditor-dialog-action-cancel' ),
		flags: 'safe',
		modes: [ 'insert', 'edit' ]
	}
];

/**
 * Configuration for booklet layout.
 *
 * @static
 * @property {Object}
 * @inheritable
 */
ve.ui.MWTemplateDialog.static.bookletLayoutConfig = {
	continuous: true,
	outlined: false
};

/* Methods */

/**
 * Handle the transclusion being ready to use.
 */
ve.ui.MWTemplateDialog.prototype.onTransclusionReady = function () {
	this.loaded = true;
	this.$element.addClass( 've-ui-mwTemplateDialog-ready' );
	this.popPending();
	this.bookletLayout.focus( 1 );
};

/**
 * Called when the transclusion model changes. E.g. parts changes, parameter values changes.
 */
ve.ui.MWTemplateDialog.prototype.onTransclusionModelChange = function () {
	if ( this.loaded ) {
		this.altered = true;
		this.setApplicableStatus();
	}
};

/**
 * Handle parts being replaced.
 *
 * @param {ve.dm.MWTransclusionPartModel} removed Removed part
 * @param {ve.dm.MWTransclusionPartModel} added Added part
 */
ve.ui.MWTemplateDialog.prototype.onReplacePart = function ( removed, added ) {
	var i, len, page, name, names, params, partPage, reselect, addedCount,
		removePages = [];

	if ( removed ) {
		// Remove parameter pages of removed templates
		partPage = this.bookletLayout.getPage( removed.getId() );
		if ( removed instanceof ve.dm.MWTemplateModel ) {
			params = removed.getParameters();
			for ( name in params ) {
				removePages.push( this.bookletLayout.getPage( params[name].getId() ) );
				delete this.expandedParamList[params[name].getId()];
			}
			removed.disconnect( this );
		}
		if ( this.loaded && !this.preventReselection && partPage.isActive() ) {
			reselect = this.bookletLayout.getClosestPage( partPage );
		}
		removePages.push( partPage );
		this.bookletLayout.removePages( removePages );
	}

	if ( added ) {
		page = this.getPageFromPart( added );
		if ( page ) {
			this.bookletLayout.addPages( [ page ], this.transclusionModel.getIndex( added ) );
			if ( reselect ) {
				// Use added page instead of closest page
				this.setPageByName( added.getId() );
			}
			// Add existing params to templates (the template might be being moved)
			if ( added instanceof ve.dm.MWTemplateModel ) {
				names = added.getParameterNames();
				params = added.getParameters();
				// Prevent selection changes
				this.preventReselection = true;
				for ( i = 0, len = names.length; i < len; i++ ) {
					this.onAddParameter( params[names[i]] );
				}
				this.preventReselection = false;
				added.connect( this, { add: 'onAddParameter', remove: 'onRemoveParameter' } );
				if ( names.length ) {
					this.setPageByName( params[names[0]].getId() );
				}
			}

			// Add required and suggested params to user created templates
			if ( added instanceof ve.dm.MWTemplateModel && this.loaded ) {
				// Prevent selection changes
				this.preventReselection = true;
				addedCount = added.addPromptedParameters();
				this.preventReselection = false;
				names = added.getParameterNames();
				params = added.getParameters();
				if ( names.length ) {
					this.setPageByName( params[names[0]].getId() );
				} else if ( addedCount === 0 ) {
					page.onAddButtonFocus();
				}
			}
		}
	} else if ( reselect ) {
		this.setPageByName( reselect.getName() );
	}

	if ( this.loaded && ( added || removed ) ) {
		this.altered = true;
	}

	this.setApplicableStatus();

	this.updateTitle();
};

/**
 * Respond to showAll event in the placeholder page.
 * Cache this so we can make sure the parameter list is expanded
 * when we next load this same pageId placeholder.
 *
 * @param {string} pageId Page Id
 */
ve.ui.MWTemplateDialog.prototype.onParameterPlaceholderShowAll = function ( pageId ) {
	this.expandedParamList[ pageId ] = true;
};
/**
 * Handle add param events.
 *
 * @param {ve.dm.MWParameterModel} param Added param
 */
ve.ui.MWTemplateDialog.prototype.onAddParameter = function ( param ) {
	var page;

	if ( param.getName() ) {
		page = new ve.ui.MWParameterPage( param, param.getId() );
	} else {
		page = new ve.ui.MWParameterPlaceholderPage( param, param.getId(), {
			expandedParamList: !!this.expandedParamList[ param.getId() ]
		} )
			.connect( this, { showAll: 'onParameterPlaceholderShowAll' } );
	}
	this.bookletLayout.addPages( [ page ], this.transclusionModel.getIndex( param ) );
	if ( this.loaded ) {
		if ( !this.preventReselection ) {
			this.setPageByName( param.getId() );
		}

		this.altered = true;
		this.setApplicableStatus();
	} else {
		this.onAddParameterBeforeLoad( page );
	}

	// Recalculate tab indexes
	this.$body.find( '.ve-ui-mwParameterPage' ).each( function ( index ) {
		$( this )
			.find( '.ve-ui-mwParameterPage-field > .oo-ui-textInputWidget > textarea' )
				.attr( 'tabindex', index * 3 + 1 )
			.end()
			.find( '.ve-ui-mwParameterPage-infoButton > a' )
				.attr( 'tabindex', index * 3 + 2 )
			.end()
			.find( '.ve-ui-mwParameterPage-removeButton > a' )
				.attr( 'tabindex', index * 3 + 3 )
			.end()
			.find( '.ve-ui-mwParameterPage-more a' )
				.attr( 'tabindex', index * 3 + 4 );
	} );
};

/**
 * Additional handling of parameter addition events before loading.
 *
 * @param {ve.ui.MWParameterPage} page Parameter page object
 */
ve.ui.MWTemplateDialog.prototype.onAddParameterBeforeLoad = function () {};

/**
 * Handle remove param events.
 *
 * @param {ve.dm.MWParameterModel} param Removed param
 */
ve.ui.MWTemplateDialog.prototype.onRemoveParameter = function ( param ) {
	var page = this.bookletLayout.getPage( param.getId() ),
		reselect = this.bookletLayout.getClosestPage( page );

	this.bookletLayout.removePages( [ page ] );
	if ( this.loaded ) {
		if ( !this.preventReselection ) {
			this.setPageByName( reselect.getName() );
		}

		this.altered = true;
		this.setApplicableStatus();
	}
};

/**
 * Sets transclusion applicable status
 *
 * If the transclusion is empty or only contains a placeholder it will not be insertable.
 * If the transclusion only contains a placeholder it will not be editable.
 */
ve.ui.MWTemplateDialog.prototype.setApplicableStatus = function () {
	var parts = this.transclusionModel && this.transclusionModel.getParts();

	if ( parts.length && !( parts[0] instanceof ve.dm.MWTemplatePlaceholderModel ) ) {
		this.actions.setAbilities( { apply: this.altered, insert: true } );
	} else {
		// Loading is resolved. We have either: 1) no parts, or 2) the a placeholder as the first part
		this.actions.setAbilities( { apply: parts.length === 0 && this.altered, insert: false } );
	}
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getBodyHeight = function () {
	return 400;
};

/**
 * Get a page for a transclusion part.
 *
 * @param {ve.dm.MWTransclusionModel} part Part to get page for
 * @return {OO.ui.PageLayout|null} Page for part, null if no matching page could be found
 */
ve.ui.MWTemplateDialog.prototype.getPageFromPart = function ( part ) {
	if ( part instanceof ve.dm.MWTemplateModel ) {
		return new ve.ui.MWTemplatePage( part, part.getId() );
	} else if ( part instanceof ve.dm.MWTemplatePlaceholderModel ) {
		return new ve.ui.MWTemplatePlaceholderPage(
			part,
			part.getId(),
			{ $overlay: this.$overlay }
		);
	}
	return null;
};

/**
 * Get the label of a template or template placeholder.
 *
 * @param {ve.dm.MWTemplateModel|ve.dm.MWTemplatePlaceholderModel} part Part to check
 * @returns {string} Label of template or template placeholder
 */
ve.ui.MWTemplateDialog.prototype.getTemplatePartLabel = function ( part ) {
	return part instanceof ve.dm.MWTemplateModel ?
		part.getSpec().getLabel() : ve.msg( 'visualeditor-dialog-transclusion-placeholder' );
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getSelectedNode = function ( data ) {
	var selectedNode = ve.ui.MWTemplateDialog.super.prototype.getSelectedNode.call( this );

	// Data initialization
	data = data || {};

	// Require template to match if specified
	if ( selectedNode && data.template && !selectedNode.isSingleTemplate( data.template ) ) {
		return null;
	}

	return selectedNode;
};

/**
 * Set the page by name.
 *
 * Page names are always the ID of the part or param they represent.
 *
 * @param {string} name Page name
 */
ve.ui.MWTemplateDialog.prototype.setPageByName = function ( name ) {
	if ( this.bookletLayout.isOutlined() ) {
		this.bookletLayout.getOutline().selectItemByData( name );
	} else {
		this.bookletLayout.setPage( name );
	}
};

/**
 * Update the dialog title.
 */
ve.ui.MWTemplateDialog.prototype.updateTitle = function () {
	var parts = this.transclusionModel && this.transclusionModel.getParts();

	this.title.setLabel(
		parts && parts.length === 1 && parts[0] ?
			this.getTemplatePartLabel( parts[0] ) :
			ve.msg( 'visualeditor-dialog-transclusion-loading' )
	);
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.initialize = function () {
	// Parent method
	ve.ui.MWTemplateDialog.super.prototype.initialize.call( this );

	// Properties
	this.panels = new OO.ui.StackLayout();
	this.bookletLayout = new OO.ui.BookletLayout( this.constructor.static.bookletLayoutConfig );

	// Initialization
	this.$content.addClass( 've-ui-mwTemplateDialog' );
	this.$body.append( this.panels.$element );
	this.panels.addItems( [ this.bookletLayout ] );
};

/**
 * If the user has left blank required parameters, confirm that they actually want to do this.
 * If no required parameters were left blank, or if they were but the user decided to go ahead
 *  anyway, the returned deferred will be resolved.
 * Otherwise, the returned deferred will be rejected.
 * @returns {jQuery.Deferred}
 */
ve.ui.MWTemplateDialog.prototype.checkRequiredParameters = function () {
	var blankRequired = [],
		deferred = $.Deferred();
	$.each( this.bookletLayout.pages, function () {
		if ( !( this instanceof ve.ui.MWParameterPage ) ) {
			return true;
		}
		if ( this.parameter.isRequired() && !this.valueInput.getValue() ) {
			blankRequired.push( mw.msg(
				'quotation-marks',
				this.parameter.template.getSpec().getParameterLabel( this.parameter.getName() )
			) );
		}
	} );
	if ( blankRequired.length ) {
		this.confirmDialogs.openWindow( 'requiredparamblankconfirm', {
			message: mw.msg(
				'visualeditor-dialog-transclusion-required-parameter-is-blank',
				mw.language.listToText( blankRequired ),
				blankRequired.length
			),
			title: mw.msg(
				'visualeditor-dialog-transclusion-required-parameter-dialog-title',
				blankRequired.length
			)
		} ).then( function ( opened ) {
			opened.then( function ( closing ) {
				closing.then( function ( data ) {
					if ( data.action === 'ok' ) {
						deferred.resolve();
					} else {
						deferred.reject();
					}
				} );
			} );
		} );
	} else {
		deferred.resolve();
	}
	return deferred.promise();
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getActionProcess = function ( action ) {
	var dialog = this;
	if ( action === 'apply' || action === 'insert' ) {
		return new OO.ui.Process( function () {
			var deferred = $.Deferred();
			dialog.checkRequiredParameters().done( function () {
				var surfaceModel = dialog.getFragment().getSurface(),
					obj = dialog.transclusionModel.getPlainObject();

				if ( dialog.selectedNode instanceof ve.dm.MWTransclusionNode ) {
					dialog.transclusionModel.updateTransclusionNode( surfaceModel, dialog.selectedNode );
				} else if ( obj !== null ) {
					// Collapse returns a new fragment, so update dialog.fragment
					dialog.fragment = dialog.getFragment().collapseToEnd();
					dialog.transclusionModel.insertTransclusionNode( dialog.getFragment() );
				}

				dialog.close( { action: action } );
			} ).always( deferred.resolve );

			return deferred;
		} );
	}

	return ve.ui.MWTemplateDialog.super.prototype.getActionProcess.call( this, action );
};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getSetupProcess = function ( data ) {
	data = data || {};
	return ve.ui.MWTemplateDialog.super.prototype.getSetupProcess.call( this, data )
		.next( function () {
			var template, promise;

			// Properties
			this.loaded = false;
			this.altered = false;
			this.transclusionModel = new ve.dm.MWTransclusionModel();

			// Events
			this.transclusionModel.connect( this, {
				replace: 'onReplacePart',
				change: 'onTransclusionModelChange'
			} );

			// Initialization
			if ( !this.selectedNode ) {
				this.actions.setMode( 'insert' );
				if ( data.template ) {
					// New specified template
					template = ve.dm.MWTemplateModel.newFromName(
						this.transclusionModel, data.template
					);
					promise = this.transclusionModel.addPart( template ).done(
						this.initializeNewTemplateParameters.bind( this )
					);
				} else {
					// New template placeholder
					promise = this.transclusionModel.addPart(
						new ve.dm.MWTemplatePlaceholderModel( this.transclusionModel )
					);
				}
			} else {
				this.actions.setMode( 'edit' );
				// Load existing template
				promise = this.transclusionModel
					.load( ve.copy( this.selectedNode.getAttribute( 'mw' ) ) )
					.done( this.initializeTemplateParameters.bind( this ) );
			}
			this.actions.setAbilities( { apply: false, insert: false } );
			this.pushPending();
			promise.always( this.onTransclusionReady.bind( this ) );
		}, this );
};

/**
 * Initialize parameters for new template insertion
 */
ve.ui.MWTemplateDialog.prototype.initializeNewTemplateParameters = function () {
	var i, parts = this.transclusionModel.getParts();
	for ( i = 0; i < parts.length; i++ ) {
		if ( parts[i] instanceof ve.dm.MWTemplateModel ) {
			parts[i].addPromptedParameters();
		}
	}
};

/**
 * Intentionally empty. This is provided for Wikia extensibility.
 */
ve.ui.MWTemplateDialog.prototype.initializeTemplateParameters = function () {};

/**
 * @inheritdoc
 */
ve.ui.MWTemplateDialog.prototype.getTeardownProcess = function ( data ) {
	return ve.ui.MWTemplateDialog.super.prototype.getTeardownProcess.call( this, data )
		.first( function () {
			// Cleanup
			this.$element.removeClass( 've-ui-mwTemplateDialog-ready' );
			this.transclusionModel.disconnect( this );
			this.transclusionModel.abortRequests();
			this.transclusionModel = null;
			this.bookletLayout.clearPages();
			this.content = null;
		}, this );
};
