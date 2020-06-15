module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    filename: 'leaflet.timespan.js',
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [
          'style-loader',
          'css-loader',
        ],
      },
      {
        test: /\.ts$/i,
        use: 'ts-loader',
      },
    ],
  },

  externals: {
    leaflet: 'L',
  }
};
