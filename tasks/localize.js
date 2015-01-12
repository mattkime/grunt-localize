'use strict';

 module.exports = function( grunt ) {

	var toPaths = function( arr ){
		return arr.map( function( fileObj ){ return fileObj.src[0] } );
	};

	var clone = function( object ){
		var cloned = {};
		Object.keys( object ).map( function ( key ) {
			cloned[ key ] = object[ key ];
		});

		return cloned;
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

		var jsToTrns = function( filePath ){
			var deferred = Q.defer();

			fs.readFile(filePath, function(err, data) {
				var tree = acorn.parse( data ),
					translations = {};

				walk.simple( tree, { "CallExpression" : function( a ){
					// mk - need to verify that is child of Meetup object
					if( ( a.callee.property && a.callee.property.name === "trn" ) ){
						translations[ a.arguments[0].value ] = a.arguments[1].value;
					}
				}
				/*
				,"MemberExpression":function(a){
						// mk - this finds Meetup.trn but doesn't give args
						if( a.object.name == "Meetup" && a.property.name === "trn"){
							//console.log(a);
						}
					}*/
				});
				deferred.resolve( translations );
			});

			return deferred.promise;
		};

		var translateTrns = function ( xlfDoms, filePath ){
			return function ( trnObj ) {
				grunt.log.write( 'processing: ', filePath, '\n' );

				return Q.all(
					xlfDoms.map( function( xlfDom ){
						var lang = xpath.select( '//file/@target-language', xlfDom )[0].nodeValue,
							trndPath = filePath.substr( 0, filePath.lastIndexOf( '.' ) ) + '_' + lang + '.js',
							trns = clone( trnObj ),
							deferred = Q.defer();

						Object.keys(trns).forEach( function( value, index ){
							var nodes = xpath.select( "//trans-unit[@id='" + value + "']/target", xlfDom );
							if( nodes.length ){
								trns[value] = nodes[0].textContent.replace("'","\\'");
							} else {
								delete trns[value];
							}
						});

						grunt.log.write( 'saving:', trndPath, '\n' );

						fs.writeFile( trndPath, template( trns ), function( err ) {
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
