const path = require('path');
const webpack = require('webpack');

const DEVELOPMENT = process.env.NODE_ENV === 'development';
const WEBPACK_SERVE = !!process.env.WEBPACK_SERVE;

module.exports = {
	devServer: {
		headers: {
			'Access-Control-Allow-Origin': '*',
		},
		port: 3000,
	},
	devtool: DEVELOPMENT ? 'source-map' : false,
	entry: {
		index: './src/index.ts',
	},
	experiments: {
		outputModule: true,
	},
	mode: DEVELOPMENT ? 'development' : 'production',
	module: {
		rules: [
			{
				test: /\.ts$/i,
				use: ['ts-loader'],
			},
		],
	},
	optimization: {
		minimize: !DEVELOPMENT,
	},
	output: {
		clean: true,
		environment: {
			dynamicImport: true,
			module: true,
		},
		filename: WEBPACK_SERVE ? '[name].js' : '[name].[contenthash].js',
		library: {
			type: 'module',
		},
		path: path.resolve('build', 'static'),
	},
	plugins: [
		new webpack.optimize.LimitChunkCountPlugin({
			maxChunks: 1,
		}),
	],
};
