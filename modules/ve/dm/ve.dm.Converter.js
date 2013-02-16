/*!
 * VisualEditor DataModel Converter class.
 *
 * @copyright 2011-2013 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 */

/**
 * DataModel converter.
 *
 * Converts between HTML DOM and VisualEditor linear data.
 *
 * @class
 * @constructor
 * @param {ve.dm.ModelRegistry} modelRegistry
 * @param {ve.dm.NodeFactory} nodeFactory
 * @param {ve.dm.AnnotationFactory} annotationFactory
 */
ve.dm.Converter = function VeDmConverter( modelRegistry, nodeFactory, annotationFactory ) {
	// Properties
	this.modelRegistry = modelRegistry;
	this.nodeFactory = nodeFactory;
	this.annotationFactory = annotationFactory;
};

/* Static Methods */

/**
 * Get linear model data from a string optionally applying annotations
 *
 * @static
 * @param {string} text Plain text to convert
 * @param {ve.AnnotationSet} [annotations] Annotations to apply
 * @returns {Array} Linear model data, one element per character
 */
ve.dm.Converter.getDataContentFromText = function ( text, annotations ) {
	var characters = text.split( '' ),
		i;
	if ( !annotations || annotations.isEmpty() ) {
		return characters;
	}
	// Apply annotations to characters
	for ( i = 0; i < characters.length; i++ ) {
		// Make a shallow copy of the annotationSet object, otherwise adding an annotation to one
		// character automatically adds it to all of others as well, annotations should be treated
		// as immutable, so it's OK to share references, but annotation sets are not immutable, so
		// it's not safe to share references - each annotated character needs its own set
		characters[i] = [characters[i], annotations.clone()];
	}
	return characters;
};

/* Methods */

/**
 * Get the DOM element for a given linear model element.
 *
 * This invokes the toDomElements function registered for the element type.
 *
 * @method
 * @param {Object} dataElement Linear model element
 * @param {HTMLDocument} doc Document to create DOM elements in
 * @returns {HTMLElement|boolean} DOM element, or false if the element cannot be converted
 */
ve.dm.Converter.prototype.getDomElementsFromDataElement = function ( dataElement, doc ) {
	var domElements, dataElementAttributes, key, matches,
		nodeClass = this.nodeFactory.lookup( dataElement.type );
	if ( !nodeClass ) {
		throw new Error( 'Attempting to convert unknown data element type ' + dataElement.type );
	}
	domElements = nodeClass.static.toDomElements( dataElement, doc );
	if ( !domElements || !domElements.length ) {
		throw new Error( 'toDomElements() failed to return an array when converting element of type ' + dataElement.type );
	}
	dataElementAttributes = dataElement.attributes;
	if ( dataElementAttributes ) {
		for ( key in dataElementAttributes ) {
			// Only include 'html/i/*' attributes and strip the 'html/i/' from the beginning of the name
			/*jshint regexp:false */
			matches = key.match( /^html\/(\d+)\/(.*)$/ );
			if ( matches ) {
				if ( domElements[matches[1]] && !domElements[matches[1]].hasAttribute( matches[2] ) ) {
					domElements[matches[1]].setAttribute( matches[2], dataElementAttributes[key] );
				}
			}
		}
	}
	// Change markers
	if (
		dataElement.internal && dataElement.internal.changed &&
		!ve.isEmptyObject( dataElement.internal.changed ) &&
		ve.init.platform.useChangeMarkers()
	) {
		domElements[0].setAttribute( 'data-ve-changed',
			JSON.stringify( dataElement.internal.changed )
		);
	}

	return domElements;
};

ve.dm.Converter.prototype.createDataElement = function ( modelClass, domElements, context ) {
	var i, j, dataElement, dataElementAttributes, domElementAttributes, domElementAttribute;
	dataElement = modelClass.static.toDataElement( domElements, ve.copyObject( context ) );
	if ( modelClass.static.storeHTMLAttributes && dataElement ) {
		for ( i = 0; i < domElements.length; i++ ) {
			domElementAttributes = domElements[i].attributes;
			if ( domElementAttributes && domElementAttributes.length ) {
				dataElementAttributes = dataElement.attributes = dataElement.attributes || {};
				// Include all attributes and prepend 'html/i/' to each attribute name
				for ( j = 0; j < domElementAttributes.length; j++ ) {
					domElementAttribute = domElementAttributes[j];
					dataElementAttributes['html/' + i + '/' + domElementAttribute.name] =
						domElementAttribute.value;
				}
			}
		}
	}
	return dataElement;
};

/**
 * Build an HTML DOM node for a linear model annotation.
 *
 * @method
 * @param {Object} dataAnnotation Annotation object
 * @returns {HTMLElement} HTML DOM node
 */
ve.dm.Converter.prototype.getDomElementFromDataAnnotation = function ( dataAnnotation, doc ) {
	var htmlData = dataAnnotation.toHTML(),
		domElement = doc.createElement( htmlData.tag );
	ve.setDomAttributes( domElement, htmlData.attributes );
	return domElement;
};

/**
 * Convert an HTML document to a linear model.
 * @param {HTMLDocument} doc HTML document to convert
 * @returns {Array} Linear model data
 */
ve.dm.Converter.prototype.getDataFromDom = function ( doc ) {
	// Possibly do things with doc and the head in the future
	return this.getDataFromDomRecursion( doc.body );
};

/**
 * Recursive implementation of getDataFromDom(). For internal use.
 *
 * @method
 * @param {HTMLElement} domElement HTML element to convert
 * @param {ve.AnnotationSet} [annotations] Annotations to apply to the generated data
 * @param {Object} [dataElement] Data element to wrap the returned data in
 * @param {Array} [path] Array of linear model element types
 * @param {boolean} [alreadyWrapped] Whether the caller has already started wrapping bare content in a paragraph
 * @returns {Array} Linear model data
 */
ve.dm.Converter.prototype.getDataFromDomRecursion = function ( domElement, annotations,
		dataElement, path, alreadyWrapped ) {
	function addWhitespace( element, index, whitespace ) {
		if ( !element.internal ) {
			element.internal = {};
		}
		// whitespace = [ outerPre, innerPre, innerPost, outerPost ]
		//           <tag>         text           </tag>          <nextTag>
		// ^^^^^^^^^^     ^^^^^^^^^    ^^^^^^^^^^^      ^^^^^^^^^^
		//  outerPre      innerPre      innerPost        outerPost
		if ( !element.internal.whitespace ) {
			element.internal.whitespace = [];
		}
		if ( !element.internal.whitespace[index] ) {
			element.internal.whitespace[index] = '';
		}
		element.internal.whitespace[index] = whitespace;
	}
	function processNextWhitespace( element ) {
		// This function uses and changes nextWhitespace in the outer function's scope,
		// which means it's not really a function but more of a shortcut.
		if ( nextWhitespace !== '' ) {
			addWhitespace( element, 0, nextWhitespace );
			nextWhitespace = '';
		}
	}
	function startWrapping() {
		// Mark this paragraph as having been generated by
		// us, so we can strip it on the way out
		wrappingParagraph = {
			'type': 'paragraph',
			'internal': { 'generated': 'wrapper' }
		};
		data.push( wrappingParagraph );
		context.inWrapper = true;
		context.canCloseWrapper = true;
		context.expectingContent = true;
		processNextWhitespace( wrappingParagraph );
	}
	function stopWrapping() {
		if ( wrappedWhitespace !== '' ) {
			// Remove wrappedWhitespace from data
			data.splice( wrappedWhitespaceIndex, wrappedWhitespace.length );
			addWhitespace( wrappingParagraph, 3, wrappedWhitespace );
			nextWhitespace = wrappedWhitespace;
		}
		data.push( { 'type': '/paragraph' } );
		wrappingParagraph = undefined;
		context.inWrapper = false;
		context.canCloseWrapper = false;
		context.expectingContent = originallyExpectingContent;
	}

	function getAboutGroup( el ) {
		var textNodes = [], aboutGroup = [ el ], elAbout, node;
		if ( !el.getAttribute || el.getAttribute( 'about' ) === null ) {
			return aboutGroup;
		}
		elAbout = el.getAttribute( 'about' );
		for ( node = el.nextSibling; node; node = node.nextSibling ) {
			if ( !node.getAttribute ) {
				// Text nodes don't have a getAttribute() method. Thanks HTML DOM,
				// that's really helpful ^^
				textNodes.push( node );
				continue;
			}
			if ( node.getAttribute( 'about' ) === elAbout ) {
				aboutGroup = aboutGroup.concat( textNodes );
				textNodes = [];
				aboutGroup.push( node );
			} else {
				break;
			}
		}
		return aboutGroup;
	}

	// Fallback to defaults
	annotations = annotations || new ve.AnnotationSet();
	path = path || ['document'];
	var i, childDomElement, childDomElements, childDataElement, text, childTypes, matches,
		wrappingParagraph, prevElement, childAnnotations, modelName, modelClass,
		annotation, childIsContent, aboutGroup,
		data = [],
		branchType = path[path.length - 1],
		branchHasContent = this.nodeFactory.canNodeContainContent( branchType ),
		originallyExpectingContent = branchHasContent || !annotations.isEmpty(),
		nextWhitespace = '',
		wrappedWhitespace = '',
		wrappedWhitespaceIndex,
		context = {
			'expectingContent': originallyExpectingContent,
			'inWrapper': alreadyWrapped,
			'canCloseWrapper': false
		};
	// Open element
	if ( dataElement ) {
		data.push( dataElement );
	}
	// Add contents
	for ( i = 0; i < domElement.childNodes.length; i++ ) {
		childDomElement = domElement.childNodes[i];
		switch ( childDomElement.nodeType ) {
			case Node.ELEMENT_NODE:
				modelName = this.modelRegistry.matchElement( childDomElement );
				modelClass = this.modelRegistry.lookup( modelName ) || ve.dm.AlienNode;
				// HACK: force MetaNode for <meta>/<link> even if they have an mw: type
				// FIXME EWWWWWW find a better way to handle this
				if (
					( childDomElement.nodeName.toLowerCase() === 'meta' || childDomElement.nodeName.toLowerCase() === 'link' ) &&
					( modelClass.prototype instanceof ve.dm.AlienNode || modelClass === ve.dm.AlienNode )
				) {
					modelClass = ve.dm.MetaNode;
				}
				if ( modelClass.prototype instanceof ve.dm.Annotation ) {
					annotation = this.annotationFactory.create( modelName, childDomElement );

					// Start wrapping if needed
					if ( !context.inWrapper && !context.expectingContent ) {
						startWrapping();
						prevElement = wrappingParagraph;
					}
					// Append child element data
					childAnnotations = annotations.clone();
					childAnnotations.push( annotation );
					data = data.concat(
						this.getDataFromDomRecursion(
							childDomElement, childAnnotations,
							undefined, path, context.inWrapper
						)
					);
				} else {
					aboutGroup = getAboutGroup( childDomElement );
					childDomElements = modelClass.static.enableAboutGrouping ?
						aboutGroup : [ childDomElement ];
					childDataElement = this.createDataElement( modelClass, childDomElements, context );
					childIsContent = this.nodeFactory.isNodeContent( childDataElement.type );

					// If childIsContent isn't what we expect, adjust
					if ( !context.expectingContent && childIsContent ) {
						startWrapping();
						prevElement = wrappingParagraph;
					} else if ( context.expectingContent && !childIsContent ) {
						if ( context.inWrapper && context.canCloseWrapper ) {
							stopWrapping();
						} else {
							// Alienate
							modelClass = ve.dm.AlienNode;
							childDomElements = modelClass.static.enableAboutGrouping ?
								aboutGroup : [ childDomElement ];
							childDataElement = this.createDataElement( modelClass, childDomElements, context );
							childIsContent = this.nodeFactory.isNodeContent( childDataElement.type );
						}
					}

					// Annotate child
					if ( childIsContent && !annotations.isEmpty() ) {
						childDataElement.annotations = annotations.clone();
					}

					// Output child and its children, if any
					if (
						childDomElements.length === 1 &&
						this.nodeFactory.canNodeHaveChildren( childDataElement.type )
					) {
						// Recursion
						// Opening and closing elements are added by the recursion too
						data = data.concat(
							this.getDataFromDomRecursion(
								childDomElement,
								new ve.AnnotationSet(),
								childDataElement,
								path.concat( childDataElement.type ),
								context.inWrapper
							)
						);
					} else {
						// Write an opening and closing
						data.push( childDataElement );
						data.push( { 'type': '/' + childDataElement.type } );
					}
					processNextWhitespace( childDataElement );
					prevElement = childDataElement;

					// In case we consumed multiple childDomElements, adjust i accordingly
					i += childDomElements.length - 1;
				}
				break;
			case Node.TEXT_NODE:
				text = childDomElement.data;
				if ( text === '' ) {
					// Empty text node?!?
					break;
				}
				if ( !originallyExpectingContent ) {
					// Strip and store outer whitespace
					if ( text.match( /^\s+$/ ) ) {
						// This text node is whitespace only
						if ( context.inWrapper ) {
							// We're already wrapping, so output this whitespace
							// and store it in wrappedWhitespace (see
							// comment about wrappedWhitespace below)
							wrappedWhitespace = text;
							wrappedWhitespaceIndex = data.length;
							data = data.concat(
								ve.dm.Converter.getDataContentFromText( wrappedWhitespace, annotations )
							);
						} else {
							// We're not in wrapping mode, store this whitespace
							if ( !prevElement ) {
								if ( dataElement ) {
									// First child, store as inner
									// whitespace in the parent
									addWhitespace( dataElement, 1, text );
								}
								// Else, WTF?!? This is not supposed to
								// happen, but it's not worth
								// throwing an exception over.
							} else {
								addWhitespace( prevElement, 3, text );
							}
							nextWhitespace = text;
							wrappedWhitespace = '';
						}
						// We're done, no actual text left to process
						break;
					} else {
						// This text node contains actual text
						// Separate the real text from the whitespace
						// HACK: . doesn't match newlines in JS, so use
						// [\s\S] to match any character
						matches = text.match( /^(\s*)([\s\S]*?)(\s*)$/ );
						if ( !context.inWrapper ) {
							// Wrap the text in a paragraph and output it
							startWrapping();

							// Only store leading whitespace if we just
							// started wrapping
							if ( matches[1] !== '' ) {
								if ( !prevElement ) {
									if ( dataElement ) {
										// First child, store as inner
										// whitespace in the parent
										addWhitespace( dataElement, 1, matches[1] );
									}
									// Else, WTF?!? This is not supposed to
									// happen, but it's not worth
									// throwing an exception over.
								} else {
									addWhitespace( prevElement, 3, matches[1] );
								}
								addWhitespace( wrappingParagraph, 0, matches[1] );
							}
						} else {
							// We were already wrapping in a paragraph,
							// so the leading whitespace must be output
							data = data.concat(
								ve.dm.Converter.getDataContentFromText( matches[1], annotations )
							);
						}
						// Output the text sans whitespace
						data = data.concat(
							ve.dm.Converter.getDataContentFromText( matches[2], annotations )
						);

						// Don't store this in wrappingParagraph.internal.whitespace[3]
						// and nextWhitespace just yet. Instead, store it
						// in wrappedWhitespace. There might be more text
						// nodes after this one, so we output wrappedWhitespace
						// for now and undo that if it turns out this was
						// the last text node. We can't output it later
						// because we have to apply the correct annotations.
						wrappedWhitespace = matches[3];
						wrappedWhitespaceIndex = data.length;
						data = data.concat(
							ve.dm.Converter.getDataContentFromText( wrappedWhitespace, annotations )
						);
						prevElement = wrappingParagraph;
						break;
					}
				}

				// Strip leading and trailing inner whitespace
				// (but only in non-annotation nodes)
				// and store it so it can be restored later.
				if (
					annotations.isEmpty() && i === 0 && dataElement &&
					!this.nodeFactory.doesNodeHaveSignificantWhitespace( dataElement.type )
				) {
					// Strip leading whitespace from the first child
					matches = text.match( /^\s+/ );
					if ( matches && matches[0] !== '' ) {
						addWhitespace( dataElement, 1, matches[0] );
						text = text.substring( matches[0].length );
					}
				}
				if (
					annotations.isEmpty() &&
					i === domElement.childNodes.length - 1 &&
					dataElement &&
					!this.nodeFactory.doesNodeHaveSignificantWhitespace( dataElement.type )
				) {
					// Strip trailing whitespace from the last child
					matches = text.match( /\s+$/ );
					if ( matches && matches[0] !== '' ) {
						addWhitespace( dataElement, 2, matches[0] );
						text = text.substring( 0,
							text.length - matches[0].length );
					}
				}

				// Annotate the text and output it
				data = data.concat(
					ve.dm.Converter.getDataContentFromText( text, annotations )
				);
				break;
			case Node.COMMENT_NODE:
				// TODO treat this as a node with nodeName #comment
				childDataElement = {
					'type': context.expectingContent ? 'metaInline' : 'metaBlock',
					'attributes': {
						'style': 'comment',
						'text': childDomElement.data
					}
				};
				data.push( childDataElement );
				data.push( { 'type': context.expectingContent ? '/metaInline' : '/metaBlock' } );
				processNextWhitespace( childDataElement );
				prevElement = childDataElement;
				break;
		}
	}
	// End auto-wrapping of bare content
	if ( context.inWrapper && context.canCloseWrapper ) {
		stopWrapping();
		// HACK: don't set context.inWrapper = false here because it's checked below
		context.inWrapper = true;
	}

	// If we're closing a node that doesn't have any children, but could contain a paragraph,
	// add a paragraph. This prevents things like empty list items
	childTypes = this.nodeFactory.getChildNodeTypes( branchType );
	if ( branchType !== 'paragraph' && dataElement && data[data.length - 1] === dataElement &&
		!context.inWrapper && !this.nodeFactory.canNodeContainContent( branchType ) &&
		!this.nodeFactory.isNodeContent( branchType ) &&
		( childTypes === null || ve.indexOf( 'paragraph', childTypes ) !== -1 )
	) {
		data.push( { 'type': 'paragraph', 'internal': { 'generated': 'empty' } } );
		data.push( { 'type': '/paragraph' } );
	}

	// Close element
	if ( dataElement ) {
		data.push( { 'type': '/' + dataElement.type } );
		// Add the whitespace after the last child to the parent as innerPost
		if ( nextWhitespace !== '' ) {
			addWhitespace( dataElement, 2, nextWhitespace );
			nextWhitespace = '';
		}
	}
	// Don't return an empty document
	if ( branchType === 'document' && data.length === 0 ) {
		return [
			{ 'type': 'paragraph', 'internal': { 'generated': 'empty' } },
			{ 'type': '/paragraph' }
		];
	}
	return data;
};

/**
 * Convert linear model data to an HTML DOM
 *
 * @method
 * @param {Array} data Linear model data
 * @returns {HTMLDocument} Document containing the resulting HTML
 */
ve.dm.Converter.prototype.getDomFromData = function ( data ) {
	var text, i, j, k, annotations, annotation, annotationElement, dataElement, arr,
		childDomElements, pre, ours, theirs, parentDomElement, lastChild, startClosingAt,
		isContentNode, changed, parentChanged,
		doc = ve.createDocumentFromHTML( '' ),
		container = doc.body,
		domElement = container,
		annotationStack = new ve.AnnotationSet();

	for ( i = 0; i < data.length; i++ ) {
		if ( typeof data[i] === 'string' ) {
			// Text
			text = '';
			// Continue forward as far as the plain text goes
			while ( typeof data[i] === 'string' ) {
				text += data[i];
				i++;
			}
			// i points to the first non-text thing, go back one so we don't skip this later
			i--;
			// Add text
			domElement.appendChild( doc.createTextNode( text ) );
		} else if (
			ve.isArray( data[i] ) ||
			(
				data[i].annotations !== undefined &&
				this.nodeFactory.isNodeContent( data[i].type )
			)
		) {
			// Annotated text or annotated nodes
			text = '';
			while (
				ve.isArray( data[i] ) ||
				(
					data[i].annotations !== undefined &&
					this.nodeFactory.isNodeContent( data[i].type )
				)
			) {
				annotations = data[i].annotations || data[i][1];
				// Close annotations as needed
				// Go through annotationStack from bottom to top (low to high),
				// and find the first annotation that's not in annotations.
				startClosingAt = undefined;
				arr = annotationStack.get();
				for ( j = 0; j < arr.length; j++ ) {
					annotation = arr[j];
					if ( !annotations.contains( annotation ) ) {
						startClosingAt = j;
						break;
					}
				}
				if ( startClosingAt !== undefined ) {
					// Close all annotations from top to bottom (high to low)
					// until we reach startClosingAt
					for ( j = annotationStack.getLength() - 1; j >= startClosingAt; j-- ) {
						// Add text if needed
						if ( text.length > 0 ) {
							domElement.appendChild( doc.createTextNode( text ) );
							text = '';
						}
						// Traverse up
						domElement = domElement.parentNode;
						// Remove from annotationStack
						annotationStack.removeAt( j );
					}
				}

				// Open annotations as needed
				arr = annotations.get();
				for ( j = 0; j < arr.length; j++ ) {
					annotation = arr[j];
					if ( !annotationStack.contains( annotation ) ) {
						// Add text if needed
						if ( text.length > 0 ) {
							domElement.appendChild( doc.createTextNode( text ) );
							text = '';
						}
						// Create new node and descend into it
						annotationElement = this.getDomElementFromDataAnnotation( annotation, doc );
						domElement.appendChild( annotationElement );
						domElement = annotationElement;
						// Add to annotationStack
						annotationStack.push( annotation );
					}
				}

				if ( data[i].annotations === undefined ) {
					// Annotated text
					text += data[i][0];
				} else {
					// Annotated node
					// Add text if needed
					if ( text.length > 0 ) {
						domElement.appendChild( doc.createTextNode( text ) );
						text = '';
					}
					// Insert the elements
					childDomElements = this.getDomElementsFromDataElement( data[i], doc );
					for ( j = 0; j < childDomElements.length; j++ ) {
						domElement.appendChild( childDomElements[j] );
					}
					// Increment i once more so we skip over the closing as well
					i++;
				}
				i++;
			}
			// We're now at the first non-annotated thing, go back one so we don't skip this later
			i--;

			// Add any gathered text
			if ( text.length > 0 ) {
				domElement.appendChild( doc.createTextNode( text ) );
				text = '';
			}
			// Close any remaining annotation nodes
			for ( j = annotationStack.getLength() - 1; j >= 0; j-- ) {
				// Traverse up
				domElement = domElement.parentNode;
			}
			// Clear annotationStack
			annotationStack = new ve.AnnotationSet();
		} else if ( data[i].type !== undefined ) {
			dataElement = data[i];
			// Element
			if ( dataElement.type.charAt( 0 ) === '/' ) {
				parentDomElement = domElement.parentNode;
				isContentNode = this.nodeFactory.isNodeContent( data[i].type.substr( 1 ) );
				// Process whitespace
				// whitespace = [ outerPre, innerPre, innerPost, outerPost ]
				if (
					!isContentNode &&
					domElement.veInternal &&
					domElement.veInternal.whitespace
				) {
					// Process inner whitespace. innerPre is for sure legitimate
					// whitespace that should be inserted; if it was a duplicate
					// of our child's outerPre, we would have cleared it.
					pre = domElement.veInternal.whitespace[1];
					if ( pre ) {
						if (
							domElement.firstChild &&
							domElement.firstChild.nodeType === 3
						) {
							// First child is a TextNode, prepend to it
							domElement.firstChild.insertData( 0, pre );
						} else {
							// Prepend a TextNode
							domElement.insertBefore(
								doc.createTextNode( pre ),
								domElement.firstChild
							);
						}
					}
					lastChild = domElement.veInternal.childDomElements ?
						domElement.veInternal
							.childDomElements[domElement.veInternal.childDomElements.length - 1]
							.lastChild :
						domElement.lastChild;
					ours = domElement.veInternal.whitespace[2];
					if ( domElement.lastOuterPost === undefined ) {
						// This node didn't have any structural children
						// (i.e. it's a content-containing node), so there's
						// nothing to check innerPost against
						theirs = ours;
					} else {
						theirs = domElement.lastOuterPost;
					}
					if ( ours && ours === theirs ) {
						if ( lastChild && lastChild.nodeType === 3 ) {
							// Last child is a TextNode, append to it
							domElement.lastChild.appendData( ours );
						} else {
							// Append a TextNode
							domElement.appendChild(
								doc.createTextNode( ours )
							);
						}
					}
					// Tell the parent about our outerPost
					parentDomElement.lastOuterPost = domElement.veInternal.whitespace[3] || '';
				} else if ( !isContentNode ) {
					// Use empty string, because undefined means there were no
					// structural children
					parentDomElement.lastOuterPost = '';
				}
				// else don't touch lastOuterPost

				// If closing a generated wrapper node, unwrap it
				// It would be nicer if we could avoid generating in the first
				// place, but then remembering where we have to skip ascending
				// to the parent would be tricky.
				// We unwrap all nodes with generated=wrapper, as well as nodes that
				// have generated=empty and are empty.
				if (
					domElement.veInternal && (
						domElement.veInternal.generated === 'wrapper' || (
							domElement.veInternal.generated === 'empty' &&
							domElement.childNodes.length === 0
						)
					)
				) {
					while ( domElement.firstChild ) {
						parentDomElement.insertBefore(
							domElement.firstChild,
							domElement
						);
					}
					// Transfer change markers
					changed = domElement.getAttribute( 'data-ve-changed' );
					if ( changed ) {
						parentChanged = parentDomElement.getAttribute( 'data-ve-changed' );
						if ( parentChanged ) {
							changed = $.parseJSON( changed );
							parentChanged = $.parseJSON( parentChanged );
							for ( k in changed ) {
								if ( k in parentChanged ) {
									parentChanged[k] += changed[k];
								} else {
									parentChanged[k] = changed[k];
								}
							}
							parentDomElement.setAttribute( 'data-ve-changed',
								JSON.stringify( parentChanged ) );
						} else {
							parentDomElement.setAttribute( 'data-ve-changed',
								changed );
						}
					}
					parentDomElement.removeChild( domElement );
				}

				delete domElement.veInternal;
				delete domElement.lastOuterPost;
				// Ascend to parent node
				domElement = parentDomElement;
			} else {
				// Create node from data
				childDomElements = this.getDomElementsFromDataElement( dataElement, doc );
				// Add reference to internal data
				childDomElements[0].veInternal = ve.extendObject(
					{ 'childDomElements': childDomElements },
					dataElement.internal || {}
				);
				// Add elements
				for ( j = 0; j < childDomElements.length; j++ ) {
					domElement.appendChild( childDomElements[j] );
				}
				// Descend into the first child node
				parentDomElement = domElement;
				domElement = childDomElements[0];

				// Process outer whitespace
				// Every piece of outer whitespace is duplicated somewhere:
				// each node's outerPost is duplicated as the next node's
				// outerPre, the first node's outerPre is the parent's
				// innerPre, and the last node's outerPost is the parent's
				// innerPost. For each piece of whitespace, we verify that
				// the duplicate matches. If it doesn't, we take that to
				// mean the user has messed with it and don't output any
				// whitespace.
				if ( domElement.veInternal && domElement.veInternal.whitespace ) {
					// Process this node's outerPre
					ours = domElement.veInternal.whitespace[0];
					theirs = undefined;
					if ( domElement.previousSibling ) {
						// Get previous sibling's outerPost
						theirs = parentDomElement.lastOuterPost;
					} else if ( parentDomElement === container ) {
						// outerPre of the very first node in the document, this one
						// has no duplicate
						theirs = ours;
					} else {
						// First child, get parent's innerPre
						if (
							parentDomElement.veInternal &&
							parentDomElement.veInternal.whitespace
						) {
							theirs = parentDomElement.veInternal.whitespace[1];
							// Clear after use so it's not used twice
							parentDomElement.veInternal.whitespace[1] = undefined;
						}
						// else theirs=undefined
					}
					if ( ours && ours === theirs ) {
						// Matches the duplicate, insert a TextNode
						parentDomElement.insertBefore(
							doc.createTextNode( ours ),
							domElement
						);
					}
				}
			}
		}
	}
	// Process the outerPost whitespace of the very last node
	if ( container.lastOuterPost !== undefined ) {
		if ( container.lastChild && container.lastChild.nodeType === 3 ) {
			// Last child is a TextNode, append to it
			container.lastChild.appendData( container.lastOuterPost );
		} else {
			// Append a TextNode
			container.appendChild( doc.createTextNode( container.lastOuterPost ) );
		}
		delete container.lastOuterPost;
	}

	// Workaround for bug 42469: if a <pre> starts with a newline, that means .innerHTML will
	// screw up and stringify it with one fewer newline. Work around this by adding a newline.
	// If we don't see a leading newline, we still don't know if the original HTML was
	// <pre>Foo</pre> or <pre>\nFoo</pre> , but that's a syntactic difference, not a semantic
	// one, and handling that is Parsoid's job.
	$( container ).find( 'pre' ).each( function() {
		var matches;
		if ( this.firstChild.nodeType === Node.TEXT_NODE ) {
			matches = this.firstChild.data.match( /^(\r\n|\r|\n)/ );
			if ( matches && matches[1] ) {
				// Prepend a newline exactly like the one we saw
				this.firstChild.insertData( 0, matches[1] );
			}
		}
	} );
	return doc;
};

/* Initialization */

ve.dm.converter = new ve.dm.Converter( ve.dm.modelRegistry, ve.dm.nodeFactory, ve.dm.annotationFactory );
