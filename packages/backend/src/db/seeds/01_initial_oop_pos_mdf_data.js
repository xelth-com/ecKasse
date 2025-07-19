// File: /packages/backend/src/db/seeds/01_initial_oop_pos_mdf_data.js
exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex('items').del();
  await knex('categories').del();
  await knex('pos_devices').del();
  await knex('branches').del();
  await knex('companies').del();

  // Inserts a seed company
  const [companyId] = await knex('companies').insert([
    {
      company_full_name: 'Betruger Sp. z o.o.',
      meta_information: JSON.stringify({ format_version: '2.0.0', default_currency_symbol: '€', default_language: 'de' }),
      global_configurations: JSON.stringify({
        tax_rates_definitions: [{ tax_rate_unique_identifier: 1, tax_rate_names: { de: "Standard (19%)" }, rate_percentage: 19.0 }],
      }),
    },
  ]).returning('id');

  // Inserts a seed branch
  const [branchId] = await knex('branches').insert([
    { company_id: companyId.id, branch_name: 'Hauptfiliale' }
  ]).returning('id');

  // Inserts a seed POS device
  const [posDeviceId] = await knex('pos_devices').insert([
    { branch_id: branchId.id, pos_device_name: 'Kasse 1', pos_device_type: 'DESKTOP', pos_device_external_number: 1 }
  ]).returning('id');

  // Inserts seed categories
  const [foodCategoryId] = await knex('categories').insert([
    { pos_device_id: posDeviceId.id, category_names: JSON.stringify({ de: 'Speisen' }), category_type: 'food' },
  ]).returning('id');
  const [drinksCategoryId] = await knex('categories').insert([
      { pos_device_id: posDeviceId.id, category_names: JSON.stringify({ de: 'Getränke' }), category_type: 'drink' }
  ]).returning('id');

  // Inserts seed items
  await knex('items').insert([
    {
      pos_device_id: posDeviceId.id,
      associated_category_unique_identifier: foodCategoryId.id,
      display_names: JSON.stringify({ menu: { de: 'Super Widget' }, button: { de: 'Widget' }, receipt: { de: 'Super Widget' } }),
      item_price_value: 19.99,
      item_flags: JSON.stringify({ is_sellable: true, has_negative_price: false }),
      audit_trail: JSON.stringify({ created_at: new Date().toISOString(), created_by: 'seed', version: 1 }),
    },
    {
        pos_device_id: posDeviceId.id,
        associated_category_unique_identifier: drinksCategoryId.id,
        display_names: JSON.stringify({ menu: { de: 'Eco Mug' }, button: { de: 'Mug' }, receipt: { de: 'Eco Mug' } }),
        item_price_value: 12.50,
        item_flags: JSON.stringify({ is_sellable: true, has_negative_price: false }),
        audit_trail: JSON.stringify({ created_at: new Date().toISOString(), created_by: 'seed', version: 1 }),
      }
  ]);
};