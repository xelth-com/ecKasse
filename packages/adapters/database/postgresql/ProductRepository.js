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
    const item = await trx('items').where({ id }).first();
    if (!item) return null;

    return {
        ...item,
        display_names: parseJsonIfNeeded(item.display_names),
        pricing_schedules: parseJsonIfNeeded(item.pricing_schedules),
        availability_schedule: parseJsonIfNeeded(item.availability_schedule),
        additional_item_attributes: parseJsonIfNeeded(item.additional_item_attributes),
        item_flags: parseJsonIfNeeded(item.item_flags),
        audit_trail: parseJsonIfNeeded(item.audit_trail)
    };
  }

  async findCategoryById(id, trx = this.db) {
    const category = await trx('categories').where({ id }).first();
    if (!category) return null;

    return {
        ...category,
        category_names: parseJsonIfNeeded(category.category_names),
        audit_trail: parseJsonIfNeeded(category.audit_trail)
    };
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
    const categories = await trx('categories').select('*');
    return categories.map(category => ({
        ...category,
        category_names: parseJsonIfNeeded(category.category_names),
        audit_trail: parseJsonIfNeeded(category.audit_trail)
    }));
  }

  async getProductsByCategoryId(categoryId, trx = this.db) {
    const items = await trx('items')
      .where('associated_category_unique_identifier', categoryId)
      .select('*');
    return items.map(item => ({
        ...item,
        display_names: parseJsonIfNeeded(item.display_names),
        item_flags: parseJsonIfNeeded(item.item_flags),
        audit_trail: parseJsonIfNeeded(item.audit_trail)
    }));
  }

  async searchProducts(searchTerm, trx = this.db) {
    const items = await trx('items')
      .leftJoin('categories', 'items.associated_category_unique_identifier', 'categories.id')
      .where('items.display_names', 'LIKE', `%${searchTerm}%`)
      .select('items.*', 'categories.category_names');
      
    return items.map(item => ({
        ...item,
        display_names: parseJsonIfNeeded(item.display_names),
        category_names: parseJsonIfNeeded(item.category_names)
    }));
  }

  async deleteById(id, trx = this.db) {
    return trx('items').where({ id }).del();
  }
}

module.exports = { ProductRepository };