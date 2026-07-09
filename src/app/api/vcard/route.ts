import { db } from '@/lib/db';
import { auth } from '@/auth';

// Contacts généraux (statiques) à inclure dans la VCard
const STATIC_VCARDS = `BEGIN:VCARD
VERSION:3.0
FN:Onyx 75
TEL;TYPE=CELL:0184832800
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Vigie 75
TEL;TYPE=CELL:0184832900
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:COT 75 - Standard
TEL;TYPE=WORK:0184833600
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:COT 75 - Alerte
TEL;TYPE=WORK:0184833601
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:COT 75 - Tactique
TEL;TYPE=WORK:0184833602
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:COT 75 - Sante
TEL;TYPE=WORK:0184833603
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:COT 75 - Effectifs
TEL;TYPE=WORK:0184833604
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:COT 75 - Logistique
TEL;TYPE=WORK:0184833605
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:COT 75 - Coordinateur
TEL;TYPE=WORK:0184833699
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:PCM 75 - Standard
TEL;TYPE=WORK:0184832850
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:PCM 75 - Alerte
TEL;TYPE=WORK:0184832851
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:PCM 75 - Tactique
TEL;TYPE=WORK:0184832852
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:PCM 75 - Sante
TEL;TYPE=WORK:0184832853
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:PCM 75 - Logistique
TEL;TYPE=WORK:0184832855
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:PCM 75 - Urgence
TEL;TYPE=WORK:0184832856
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:PCM 75 - Chef PCM
TEL;TYPE=WORK:0184832899
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:PCM 75 - Chef de Dispositif
TEL;TYPE=WORK:0184832898
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Astreinte Logistique 75
TEL;TYPE=CELL:0184832910
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Astreinte Sante 75
TEL;TYPE=CELL:0184832920
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Astreinte Psy 75
TEL;TYPE=CELL:0184832930
END:VCARD
`;

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return new Response('Non authentifié', { status: 401 });
        }

        // Récupérer toutes les ULs avec leurs numéros
        const res = await db.execute(`SELECT name, phoneNumbers FROM "UniteLocale" ORDER BY name ASC`);
        
        let vcardContent = '';

        for (const row of res.rows) {
            const ulName = row.name as string;
            const phoneNumbersStr = row.phoneNumbers as string | null;
            if (!phoneNumbersStr) continue;

            try {
                const phoneNumbers = JSON.parse(phoneNumbersStr) as Array<{ label: string; number: string }>;
                for (const phone of phoneNumbers) {
                    if (!phone.label || !phone.number) continue;

                    // Nettoyer le numéro pour l'annuaire (conserver uniquement chiffres et éventuellement le +)
                    const cleanNumber = phone.number.replace(/[^\d+]/g, '');

                    vcardContent += `BEGIN:VCARD\n`;
                    vcardContent += `VERSION:3.0\n`;
                    vcardContent += `FN:${phone.label} ${ulName}\n`;
                    vcardContent += `TEL;TYPE=CELL:${cleanNumber}\n`;
                    vcardContent += `END:VCARD\n`;
                }
            } catch {
                // Ignore parse errors for specific row
            }
        }

        // Ajouter les contacts généraux
        vcardContent += STATIC_VCARDS;

        return new Response(vcardContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/vcard; charset=utf-8',
                'Content-Disposition': 'attachment; filename="Annuaire_CRF_Paris.vcf"',
            },
        });
    } catch (error) {
        console.error('Error generating dynamic VCard:', error);
        return new Response('Erreur serveur', { status: 500 });
    }
}
