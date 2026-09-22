#!/bin/bash

# ZYRAXON SDK Publish Script
# Usage: ./publish.sh [version]

set -e

VERSION=${1:-"19.0.1"}

echo "🚀 Publishing ZYRAXON SDK v$VERSION..."

# Update version in package.json
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json

# Build
echo "📦 Building SDK..."
bun run build

# Publish to npm
echo "📤 Publishing to npm registry..."
npm publish --access public

echo "✅ Successfully published @zyraxon-ai/sdk@$VERSION"
echo ""
echo "📋 Next steps:"
echo "   1. Create a GitHub release with tag: sdk-v$VERSION"
echo "   2. The GitHub Actions workflow will automatically publish to npm"
echo "   3. Update documentation if needed"
echo ""
echo "🔗 Links:"
echo "   - npm: https://www.npmjs.com/package/@zyraxon-ai/sdk"
echo "   - GitHub: https://github.com/onelpawarai-X/ZYRAXON-AI"
