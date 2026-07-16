-- Caisse Sur Place (POS) — nouvelle source de commande 'comptoir' sur l'enum order_source
-- (cf. plan docs/superpowers/plans/2026-07-13-pos-comptoir.md, Task POS1).
-- ALTER TYPE ... ADD VALUE seule dans ce fichier, aucune ligne de cette migration ne référence
-- la nouvelle valeur — évite l'erreur "unsafe use of new value of enum type" (une valeur ajoutée
-- ne peut pas être utilisée dans la même transaction qui l'ajoute). Ne PAS appliquer en prod ici
-- (cf. Task POS5) — le round-trip prod se fait via MCP au moment du déploiement.
alter type order_source add value if not exists 'comptoir';

notify pgrst, 'reload schema';
