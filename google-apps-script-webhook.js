/**
 * Webhook Google Apps Script pour l'envoi d'e-mails (CRF Paris 18)
 * Déployer "En tant qu'application Web"
 * Exécuter en tant que : "Moi" (ton propre compte Jean-Noël)
 * Qui a accès : "N'importe qui"
 * 
 * PRÉREQUIS : Ton compte Google *doit* avoir 'logistique.paris18@croix-rouge.fr' 
 * configuré comme alias ("Envoyer des e-mails en tant que") dans les paramètres de ton Gmail.
 */

const SECRET_TOKEN = "CHANGER_CECI_PAR_UN_MOT_DE_PASSE_FORT"; // À reporter dans le .env de Next.js sous WEBHOOK_SECRET

function doPost(e) {
    try {
        const payload = JSON.parse(e.postData.contents);

        // Vérification de sécurité
        if (payload.secret !== SECRET_TOKEN) {
            return ContentService.createTextOutput(JSON.stringify({ error: "Unauthorized" }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        const { to, subject, body } = payload;

        if (!to || !subject || !body) {
            return ContentService.createTextOutput(JSON.stringify({ error: "Missing required fields (to, subject, body)" }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // Envoi de l'email via GmailApp en spécifiant l'alias d'expédition
        GmailApp.sendEmail(to.join(','), subject, "", {
            from: "logistique.paris18@croix-rouge.fr",
            htmlBody: body,
            name: "Gestion de Flotte - CRF Paris 18"
        });

        return ContentService.createTextOutput(JSON.stringify({ success: true }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// Fonction de test pour valider que le script est bien en vie
function doGet(e) {
    return ContentService.createTextOutput("Webhook Email Actif.")
        .setMimeType(ContentService.MimeType.TEXT);
}
