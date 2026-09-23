import js from '@eslint/js'

export default [
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'public/**',
      '.vscode/**',
      '*.min.js'
    ]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Image: 'readonly',
        Audio: 'readonly',
        Blob: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        CustomEvent: 'readonly',
        RTCPeerConnection: 'readonly',
        crypto: 'readonly',
        caches: 'readonly',
        MouseEvent: 'readonly',
        Element: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        FileReader: 'readonly',
        TextEncoder: 'readonly',
        BarcodeDetector: 'readonly',
        WebGL2RenderingContext: 'readonly',
        alert: 'readonly',
        process: 'readonly',
        Netlify: 'readonly'
      }
    },
    rules: {
      // No semicolons at the end of statements
      'semi': ['error', 'never'],
      'semi-spacing': ['error', { before: false, after: true }],

      // Use 2 spaces for indentation
      'indent': ['error', 2, {
        SwitchCase: 1,
        VariableDeclarator: 1,
        outerIIFEBody: 1,
        MemberExpression: 1,
        FunctionDeclaration: { parameters: 1, body: 1 },
        FunctionExpression: { parameters: 1, body: 1 },
        CallExpression: { arguments: 1 },
        ArrayExpression: 1,
        ObjectExpression: 1,
        ImportDeclaration: 1,
        flatTernaryExpressions: false,
        ignoreComments: false
      }],

      // Additional code style rules for consistency
      'quotes': ['error', 'single', { avoidEscape: true }],
      'comma-dangle': ['error', 'never'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'space-before-blocks': ['error', 'always'],
      'space-before-function-paren': ['error', 'never'],
      'keyword-spacing': ['error', { before: true, after: true }],
      'space-infix-ops': 'error',
      'space-unary-ops': ['error', { words: true, nonwords: false }],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always'],
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],

      // Modern JavaScript best practices
      'prefer-const': 'error',
      'no-var': 'error',
      'arrow-spacing': ['error', { before: true, after: true }],
      'template-curly-spacing': ['error', 'never'],

      // Common error prevention
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // Allow console for game development
      'no-debugger': 'warn'
    },
    files: ['**/*.js']
  }
]
