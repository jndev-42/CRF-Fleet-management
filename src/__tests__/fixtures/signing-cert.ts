/**
 * Certificat P12 auto-signé, généré À L'EXÉCUTION pour les tests.
 *
 * Aucun `.p12` n'est committé : le fichier serait un secret dans l'historique git,
 * même s'il ne sert qu'aux tests.
 *
 * La génération d'une clé RSA 2048 coûte ~1 s ; le résultat est mémoïsé pour
 * l'ensemble du fichier de test.
 */

import forge from 'node-forge';

let cached: { p12Base64: string; passphrase: string } | null = null;

export function testSigningCert(): { p12Base64: string; passphrase: string } {
    if (cached) return cached;

    const passphrase = 'test-passphrase';
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);

    const attrs = [
        { name: 'commonName', value: 'Test Signer' },
        { name: 'organizationName', value: 'CRF Test' },
        { name: 'countryName', value: 'FR' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: '3des' });
    cached = {
        p12Base64: forge.util.encode64(forge.asn1.toDer(p12Asn1).getBytes()),
        passphrase,
    };
    return cached;
}

/** Installe le certificat de test dans l'environnement du processus. */
export function installTestCert(): void {
    const { p12Base64, passphrase } = testSigningCert();
    process.env.SIGNING_CERT_P12_BASE64 = p12Base64;
    process.env.SIGNING_CERT_PASSPHRASE = passphrase;
}
