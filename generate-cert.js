// generate-cert.js
// Run: node generate-cert.js

const selfsigned = require('selfsigned');
const fs = require('fs');

console.log('🔐 Generating self-signed SSL certificate...\n');

const attrs = [
  { name: 'commonName', value: 'api.find-hire.co' },
  { name: 'countryName', value: 'IN' },
  { name: 'stateOrProvinceName', value: 'Tamil Nadu' },
  { name: 'localityName', value: 'Chennai' },
  { name: 'organizationName', value: 'Find-Hire' }
];

const options = {
  keySize: 2048,
  days: 365,
  algorithm: 'sha256',
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'api.find-hire.co' },
        { type: 2, value: 'find-hire.co' },
        { type: 2, value: 'localhost' }
      ]
    }
  ]
};

try {
  const pems = selfsigned.generate(attrs, options);
  
  // Write certificate files
  fs.writeFileSync('cert.pem', pems.cert);
  fs.writeFileSync('key.pem', pems.private);
  
  console.log('✅ SSL certificates generated successfully!');
  console.log('📁 Files created:');
  console.log('   - cert.pem (certificate)');
  console.log('   - key.pem (private key)');
  console.log('\n⚠️  Note: Self-signed certificates will show browser warnings.');
  console.log('   For production, use real SSL certificates from aaPanel.\n');
  
} catch (error) {
  console.error('❌ Error generating certificates:', error.message);
  process.exit(1);
}