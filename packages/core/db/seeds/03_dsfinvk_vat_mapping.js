exports.seed = async function(knex) {
  await knex('dsfinvk_vat_mapping').del();
  await knex('dsfinvk_vat_mapping').insert([
    { dsfinvk_ust_schluessel: 1, internal_tax_rate: 19.00, description: 'Allgemeiner Steuersatz nach § 12 Abs. 1 UStG' },
    { dsfinvk_ust_schluessel: 2, internal_tax_rate: 7.00, description: 'Ermäßigter Steuersatz nach § 12 Abs. 2 UStG' },
    { dsfinvk_ust_schluessel: 3, internal_tax_rate: 10.70, description: 'Durchschnittssatz nach § 24 Abs. 1 Nr. 3 UStG (übrige Fälle)' },
    { dsfinvk_ust_schluessel: 4, internal_tax_rate: 5.50, description: 'Durchschnittssatz nach § 24 Abs. 1 Nr. 1 UStG' },
    { dsfinvk_ust_schluessel: 5, internal_tax_rate: 0.00, description: 'Nicht Steuerbar' },
    { dsfinvk_ust_schluessel: 6, internal_tax_rate: 0.01, description: 'Umsatzsteuerfrei' },
    { dsfinvk_ust_schluessel: 7, internal_tax_rate: 0.02, description: 'UmsatzsteuerNichtErmittelbar' },
    { dsfinvk_ust_schluessel: 8, internal_tax_rate: 0.03, description: 'Ermäßigter Steuersatz nach § 12 Abs. 3 UStG' },
    { dsfinvk_ust_schluessel: 11, internal_tax_rate: 19.01, description: 'Historischer allgemeiner Steuersatz nach § 12 Abs. 1 UStG' },
    { dsfinvk_ust_schluessel: 12, internal_tax_rate: 7.01, description: 'Historischer ermäßigter Steuersatz nach § 12 Abs. 2 UStG' },
    { dsfinvk_ust_schluessel: 13, internal_tax_rate: 10.71, description: 'Historischer Durchschnittssatz nach § 24 Abs. 1 Nr. 3 UStG' },
    { dsfinvk_ust_schluessel: 21, internal_tax_rate: 16.00, description: 'Historischer allgemeiner Steuersatz nach § 12 Abs. 1 UStG' },
    { dsfinvk_ust_schluessel: 22, internal_tax_rate: 5.00, description: 'Historischer ermäßigter Steuersatz nach § 12 Abs. 2 UStG' },
    { dsfinvk_ust_schluessel: 23, internal_tax_rate: 9.50, description: 'Historischer Durchschnittssatz nach § 24 Abs. 1 Nr. 3 UStG' },
    { dsfinvk_ust_schluessel: 33, internal_tax_rate: 9.00, description: 'Historischer Durchschnittssatz nach § 24 Abs. 1 Nr. 3 UStG' },
    { dsfinvk_ust_schluessel: 43, internal_tax_rate: 8.40, description: 'Historischer Durchschnittssatz nach § 24 Abs. 1 Nr. 3 UStG' }
  ]);
};