const logger = require('../../../core/config/logger');
const { parseJsonIfNeeded } = require('../../../core/utils/db-helper');

class ProductRepository {
  constructor(db) {
    this.db = db;
  }

  async findCategoryByName(categoryName, trx = this.db) {
    const categories = await trx('categories').select('*');
    for (const category of categories) {
      const categoryNames = parseJsonIfNeeded(category.category_names);
      if (categoryNames && categoryNames.de && categoryNames.de.toLowerCase() === categoryName.toLowerCase()) {
        return category;
      }
    }
    return null;
  }

  async findById(id, trx = this.db) {
    return trx('items').where({ id }).first();
  }

  async findCategoryById(id, trx = this.db) {
    return trx('categories').where({ id }).first();
  }

  async create(productData, trx = this.db) {
    const [result] = await trx('items').insert(productData).returning('id');
    return result.id || result;
  }

  async update(id, updateData, trx = this.db) {
    const [updated] = await trx('items').where({ id }).update(updateData).returning('*');
    return updated;
  }

  async addEmbedding(embeddingData, trx = this.db) {
    const [result] = await trx('vec_items').insert(embeddingData).returning('*');
    return result;
  }

  async getAllCategories(trx = this.db) {
    return trx('categories').select('*');
  }

  async getProductsByCategoryId(categoryId, trx = this.db) {
    return trx('items')
      .where('associated_category_unique_identifier', categoryId)
      .select('*');
  }

  async searchProducts(searchTerm, trx = this.db) {
    return trx('items')
      .leftJoin('categories', 'items.associated_category_unique_identifier', 'categories.id')
      .where('items.display_names', 'LIKE', `%${searchTerm}%`)
      .select('items.*', 'categories.category_names');
  }

  async deleteById(id, trx = this.db) {
    return trx('items').where({ id }).del();
  }
}

module.exports = { ProductRepository };