'use strict';

 module.exports = function( grunt ) {

	var toPaths = function( arr ){
		return arr.map( function( fileObj ){ return fileObj.src[0] } );
	};

	grunt.registerMultiTask( 'localize', 'localize!', function() {
		var fs = require( 'fs' ),
			xpath = require( 'xpath' ),
			dom = require( 'xmldom' ).DOMParser,
			Q = require( 'q' ),
			acorn = require( 'acorn' ),
			walk = require( 'acorn/util/walk' ),
			handlebars = require( 'handlebars' ),
			source = this.options().template,
			template = handlebars.compile( source ),
			done = this.async(),
			context = this;


		var xlfsToDoms = function( xlfs ) {
			return Q.all( toPaths( xlfs ).map( function( xlf ){
				var deferred = Q.defer();

				grunt.log.write( "reading:", xlf , "\n" );

				fs.readFile( xlf, function( err, data){
					grunt.log.write( "parsing:", xlf, "\n" );
					deferred.resolve( new dom().parseFromString( data + "" ) );
				});

				return deferred.promise;
			}) );
		};

		var isTrnCall = function( node ){
			return ( node.callee.property && node.callee.property.name === "trn" ) || node.callee.name === "trn";
		};

		var isHbsJsTrnCall = function( node ){
			return node.callee.object &&
				( node.callee.object.object && node.callee.object.object.name === "helpers" ) &&
				( node.callee.object.property && node.callee.object.property.name === "trn" ) &&
				( node.callee.property && node.callee.property.name === "call" )
		};

		var jsToTrns = function( filePath ){
			var deferred = Q.defer();

			fs.readFile(filePath, function(err, data) {
				var tree = acorn.parse( data ),
					translations = [];

				walk.simple( tree, { "CallExpression" : function( node ){
					if( isTrnCall(node) ){
						translations.push( node.arguments[0].value );
					}

					if( isHbsJsTrnCall(node) ) {
						translations.push( node.arguments[1].value );
					}
				}
				});
				deferred.resolve( translations );
			});

			return deferred.promise;
		};

		var translateTrns = function ( xlfDoms, filePath ){
			return function ( trnKeys ) {
				grunt.log.write( 'processing: ', filePath, '\n' );

				return Q.all(
					xlfDoms.map( function( xlfDom ){
						var lang = xpath.select( '//file/@target-language', xlfDom )[0].nodeValue,
							trndPath = filePath.substr( 0, filePath.lastIndexOf( '.' ) ) + '_' + lang + '.js',
							trnObj = {},
							re = /'/g,
							deferred = Q.defer();

						trnKeys.forEach( function( value, index ){
							var nodes = xpath.select( "//trans-unit[@id='" + value + "']/target", xlfDom );
							if( nodes.length ){
								trnObj[value] = nodes[0].textContent.replace(re, "\\'").replace(/\n/g,"");
							}
						});

						grunt.log.write( 'saving:', trndPath, '\n' );

						fs.writeFile( trndPath, template( trnObj ), function( err ) {
							if(err) {
								deferred.reject( err );
							} else {
								deferred.resolve();
							}
						});

						return deferred.promise;
					}) //end map
				); //end Q.all
			}; //end fn def

		};

		// mk - time to do the work!
		var xlfs = grunt.task.normalizeMultiTaskFiles( this.options().xlfs );

		xlfsToDoms( xlfs ).then( function( xlfDoms ){
			toPaths( context.files ).forEach( function( file ){
				jsToTrns( file )
					.then( translateTrns( xlfDoms, file ) )
					.then( done );
			});
		});

	});
 };
