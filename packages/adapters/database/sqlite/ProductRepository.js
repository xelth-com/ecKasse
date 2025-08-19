// packages/adapters/database/sqlite/ProductRepository.js
const logger = require('../../../core/config/logger');

class ProductRepository {
  constructor(db) {
    this.db = db;
  }

  async findCategoryByName(name, trx = this.db) {
    logger.info({ repo: 'ProductRepository', function: 'findCategoryByName', name }, 'Finding category by name');
    const query = trx('categories').whereRaw("json_extract(category_names, '$.de') = ?", [name]);
    return query.first();
  }

  async create(productData, trx = this.db) {
    logger.info({ repo: 'ProductRepository', function: 'create', productData }, 'Creating product in DB');
    const [result] = await trx('items').insert(productData).returning('id');
    return typeof result === 'object' ? result.id : result;
  }

  async addEmbedding(embeddingData, trx = this.db) {
    logger.info({ repo: 'ProductRepository', function: 'addEmbedding', itemId: embeddingData.rowid }, 'Adding embedding to DB');
    await trx.raw(
      'INSERT INTO vec_items(rowid, item_embedding) VALUES (?, ?)',
      [embeddingData.rowid, embeddingData.item_embedding]
    );
  }

  async findById(id, trx = this.db) {
    return trx('items').where('id', id).first();
  }

  async update(id, updateData, trx = this.db) {
    logger.info({ repo: 'ProductRepository', function: 'update', id, updateData }, 'Updating product in DB');
    return trx('items').where('id', id).update(updateData);
  }
}

module.exports = { ProductRepository };