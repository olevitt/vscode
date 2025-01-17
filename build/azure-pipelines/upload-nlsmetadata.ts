/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as es from 'event-stream';
import * as Vinyl from 'vinyl';
import * as vfs from 'vinyl-fs';
import * as util from '../lib/util';
import * as merge from 'gulp-merge-json';
const azure = require('gulp-azure-storage');

const root = path.dirname(path.dirname(__dirname));
const commit = util.getVersion(root);

interface NlsMetadata {
	keys: { [module: string]: string },
	messages: { [module: string]: string },
	bundles: { [bundle: string]: string[] },
}

function main() {
	return es.merge(
		vfs.src('out-vscode-min/nls.metadata.json', { base: 'out-vscode-min' }),
		vfs.src('.build/extensions/**/nls.metadata.json', { base: '.build/extensions' }),
		vfs.src('.build/extensions/**/nls.metadata.header.json', { base: '.build/extensions' }),
		vfs.src('.build/extensions/**/package.nls.json', { base: '.build/extensions' }))
		.pipe(merge({
			fileName: 'combined.nls.metadata.json',
			edit: (parsedJson, file) => {
				let key;
				if (file.base === 'out-vscode-min') {
					return { vscode: parsedJson };
				}

				// Handle extensions and follow the same structure as the Core nls file.
				switch (file.basename) {
					case 'package.nls.json':
						// put package.nls.json content in Core NlsMetadata format
						// language packs use the key "package" to specify that
						// translations are for the package.json file
						parsedJson = {
							messages: {
								package: Object.values(parsedJson)
							},
							keys: {
								package: Object.keys(parsedJson)
							},
							bundles: {
								main: ['package']
							}
						};
						break;

					case 'nls.metadata.header.json':
						parsedJson = { header: parsedJson };
						break;

					case 'nls.metadata.json':
						// put nls.metadata.json content in Core NlsMetadata format
						const modules = Object.keys(parsedJson);

						const json: NlsMetadata = {
							keys: {},
							messages: {},
							bundles: {
								main: []
							}
						};
						for (const module of modules) {
							json.messages[module] = parsedJson[module].messages;
							json.keys[module] = parsedJson[module].keys;
							json.bundles.main.push(module);
						}
						parsedJson = json;
						break;
				}
				key = 'vscode.' + file.relative.split('/')[0];
				return { [key]: parsedJson };
			},
		}))
		.pipe(vfs.dest('./nlsMetadata'))
		.pipe(es.through(function (data: Vinyl) {
			console.log(`Uploading ${data.path}`);
			// trigger artifact upload
			console.log(`##vso[artifact.upload containerfolder=nlsmetadata;artifactname=combined.nls.metadata.json]${data.path}`);
			this.emit('data', data);
		}))
		.pipe(azure.upload({
			account: process.env.AZURE_STORAGE_ACCOUNT,
			key: process.env.AZURE_STORAGE_ACCESS_KEY,
			container: 'nlsmetadata',
			prefix: commit + '/'
		}));
}

main();
