// src/repositories/slide.repository.ts
import { KvCache } from '@liquidmetal-ai/raindrop-framework';
import {
  Slide,
  CreateSlideInput,
  UpdateSlideInput,
  ReorderSlidesInput,
} from '../models/slide.model';
import { Timestamp } from '../models/common.model';
import { NotFoundError, ValidationError } from '../utils/errors';

export class SlideRepository {
  private kv: KvCache;
  private readonly SLIDE_PREFIX = 'slide:';
  private readonly COURSE_SLIDES_PREFIX = 'course_slides:';
  private readonly SLIDE_ORDER_PREFIX = 'slide_order:';
  private readonly OUTLINE_SLIDES_PREFIX = 'outline_slides:';

  constructor(kv: KvCache) {
    this.kv = kv;
  }

  /**
   * Generate a unique slide ID
   */
  private generateId(): string {
    return `slide_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get the ordered slide IDs for a course
   */
  private async getSlideOrder(courseId: string): Promise<string[]> {
    const orderKey = `${this.SLIDE_ORDER_PREFIX}${courseId}`;
    const orderData = await this.kv.get(orderKey);
    
    if (!orderData) {
      return [];
    }
    
    return JSON.parse(orderData) as string[];
  }

  /**
   * Set the ordered slide IDs for a course
   */
  private async setSlideOrder(courseId: string, slideIds: string[]): Promise<void> {
    const orderKey = `${this.SLIDE_ORDER_PREFIX}${courseId}`;
    await this.kv.put(orderKey, JSON.stringify(slideIds));
  }

  /**
   * Create a new slide
   */
  async create(input: CreateSlideInput): Promise<Slide> {
    // Validate required fields
    if (!input.title || input.title.trim().length === 0) {
      throw new ValidationError('Slide title is required');
    }
    if (!input.content || input.content.length === 0) {
      throw new ValidationError('Slide content is required');
    }

    const now: Timestamp = new Date().toISOString();
    const slideId = this.generateId();

    const slide: Slide = {
      slideId,
      courseId: input.courseId,
      order: input.order,
      title: input.title,
      content: input.content,
      speakerNotes: input.speakerNotes,
      outlineNodeId: input.outlineNodeId,
      accessibilityMode: input.accessibilityMode,
      visualAids: input.visualAids,
      audioNarration: input.audioNarration,
      layout: input.layout || 'content',
      theme: input.theme,
      backgroundColor: input.backgroundColor,
      generatedBy: input.generatedBy || 'teacher',
      aiPrompt: input.aiPrompt,
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    // Store slide data
    const slideKey = `${this.SLIDE_PREFIX}${slideId}`;
    await this.kv.put(slideKey, JSON.stringify(slide));

    // Update course slides index
    await this.kv.put(
      `${this.COURSE_SLIDES_PREFIX}${input.courseId}:${String(input.order).padStart(6, '0')}`,
      slideId
    );

    // Update outline slides index if linked to outline node
    if (input.outlineNodeId) {
      await this.kv.put(
        `${this.OUTLINE_SLIDES_PREFIX}${input.outlineNodeId}:${slideId}`,
        slideId
      );
    }

    // Update slide order list
    const slideOrder = await this.getSlideOrder(input.courseId);
    slideOrder.splice(input.order, 0, slideId);
    await this.setSlideOrder(input.courseId, slideOrder);

    return slide;
  }

  /**
   * Batch create slides (for generating multiple slides at once)
   */
  async batchCreate(inputs: CreateSlideInput[]): Promise<Slide[]> {
    const slides: Slide[] = [];
    
    for (const input of inputs) {
      const slide = await this.create(input);
      slides.push(slide);
    }
    
    return slides;
  }

  /**
   * Get slide by ID
   */
  async getById(slideId: string): Promise<Slide> {
    const slideKey = `${this.SLIDE_PREFIX}${slideId}`;
    const slideData = await this.kv.get(slideKey);

    if (!slideData) {
      throw new NotFoundError(`Slide with ID ${slideId} not found`);
    }

    return JSON.parse(slideData) as Slide;
  }

  /**
   * Update slide
   */
  async update(slideId: string, updates: UpdateSlideInput): Promise<Slide> {
    const existingSlide = await this.getById(slideId);

    // Update outline slides index if outlineNodeId changed
    if (updates.outlineNodeId && updates.outlineNodeId !== existingSlide.outlineNodeId) {
      // Remove old index
      if (existingSlide.outlineNodeId) {
        await this.kv.delete(
          `${this.OUTLINE_SLIDES_PREFIX}${existingSlide.outlineNodeId}:${slideId}`
        );
      }
      // Add new index
      await this.kv.put(
        `${this.OUTLINE_SLIDES_PREFIX}${updates.outlineNodeId}:${slideId}`,
        slideId
      );
    }

    const updatedSlide: Slide = {
      ...existingSlide,
      ...updates,
      slideId: existingSlide.slideId,
      courseId: existingSlide.courseId,
      order: existingSlide.order, // Order can't be changed via update
      createdAt: existingSlide.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const slideKey = `${this.SLIDE_PREFIX}${slideId}`;
    await this.kv.put(slideKey, JSON.stringify(updatedSlide));

    return updatedSlide;
  }

  /**
   * Delete slide
   */
  async delete(slideId: string): Promise<void> {
    const slide = await this.getById(slideId);

    // Delete slide data
    const slideKey = `${this.SLIDE_PREFIX}${slideId}`;
    await this.kv.delete(slideKey);

    // Delete course slides index
    await this.kv.delete(
      `${this.COURSE_SLIDES_PREFIX}${slide.courseId}:${String(slide.order).padStart(6, '0')}`
    );

    // Delete outline slides index
    if (slide.outlineNodeId) {
      await this.kv.delete(
        `${this.OUTLINE_SLIDES_PREFIX}${slide.outlineNodeId}:${slideId}`
      );
    }

    // Update slide order list
    const slideOrder = await this.getSlideOrder(slide.courseId);
    const index = slideOrder.indexOf(slideId);
    if (index > -1) {
      slideOrder.splice(index, 1);
      await this.setSlideOrder(slide.courseId, slideOrder);
    }

    // Reorder remaining slides
    await this.reorderAfterDelete(slide.courseId, slide.order);
  }

  /**
   * Reorder slides after deletion
   */
  private async reorderAfterDelete(courseId: string, deletedOrder: number): Promise<void> {
    const slides = await this.listByCourse(courseId);
    
    for (const slide of slides) {
      if (slide.order > deletedOrder) {
        slide.order -= 1;
        const slideKey = `${this.SLIDE_PREFIX}${slide.slideId}`;
        await this.kv.put(slideKey, JSON.stringify(slide));
        
        // Update index
        await this.kv.delete(
          `${this.COURSE_SLIDES_PREFIX}${courseId}:${String(slide.order + 1).padStart(6, '0')}`
        );
        await this.kv.put(
          `${this.COURSE_SLIDES_PREFIX}${courseId}:${String(slide.order).padStart(6, '0')}`,
          slide.slideId
        );
      }
    }
  }

  /**
   * List slides by course (ordered)
   */
  async listByCourse(courseId: string, options?: { limit?: number }): Promise<Slide[]> {
    const slideOrder = await this.getSlideOrder(courseId);
    
    if (slideOrder.length === 0) {
      // Fallback: query by prefix if order list doesn't exist
      return this.listByCoursePrefix(courseId, options);
    }
    
    const slides: Slide[] = [];
    const limit = options?.limit || slideOrder.length;
    
    for (let i = 0; i < Math.min(limit, slideOrder.length); i++) {
    //   try {
    //     const slide = await this.getById(slideOrder[i]);
    //     slides.push(slide);
    //   } catch (error) {
    //     console.error(`Error fetching slide ${slideOrder[i]}:`, error);
    //   }
      const slideId = slideOrder[i];
      if (!slideId) continue; // Skip invalid IDs

      try {
        const slide = await this.getById(slideId);
        slides.push(slide);
      } catch (error) {
        console.error(`Error fetching slide ${slideId}:`, error);
      }
    }
    
    return slides;
  }

  /**
   * Fallback method: List slides by course using prefix query
   */
  private async listByCoursePrefix(courseId: string, options?: { limit?: number }): Promise<Slide[]> {
    const prefix = `${this.COURSE_SLIDES_PREFIX}${courseId}:`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 100,
    });

    const slides: Slide[] = [];
    for (const key of result.keys) {
      try {
        const slideId = await this.kv.get(key.name);
        if (slideId) {
          const slide = await this.getById(slideId);
          slides.push(slide);
        }
      } catch (error) {
        console.error(`Error fetching slide from key ${key.name}:`, error);
      }
    }

    // Sort by order
    return slides.sort((a, b) => a.order - b.order);
  }

  /**
   * List slides by outline node
   */
  async listByOutlineNode(outlineNodeId: string): Promise<Slide[]> {
    const prefix = `${this.OUTLINE_SLIDES_PREFIX}${outlineNodeId}:`;
    const result = await this.kv.list({ prefix });

    const slides: Slide[] = [];
    for (const key of result.keys) {
      try {
        const slideId = key.name.split(':').pop() || '';
        const slide = await this.getById(slideId);
        slides.push(slide);
      } catch (error) {
        console.error(`Error fetching slide from key ${key.name}:`, error);
      }
    }

    // Sort by order
    return slides.sort((a, b) => a.order - b.order);
  }

  /**
   * Reorder slides
   */
  async reorder(courseId: string, input: ReorderSlidesInput): Promise<Slide[]> {
    const slides: Slide[] = [];
    
    // Validate that all slides belong to the course
    for (const { slideId, newOrder } of input.slideOrders) {
      const slide = await this.getById(slideId);
      if (slide.courseId !== courseId) {
        throw new ValidationError(`Slide ${slideId} does not belong to course ${courseId}`);
      }
    }

    // Update each slide's order
    for (const { slideId, newOrder } of input.slideOrders) {
      const slide = await this.getById(slideId);
      const oldOrder = slide.order;

      // Delete old index
      await this.kv.delete(
        `${this.COURSE_SLIDES_PREFIX}${courseId}:${String(oldOrder).padStart(6, '0')}`
      );

      // Update slide
      slide.order = newOrder;
      slide.updatedAt = new Date().toISOString();

      const slideKey = `${this.SLIDE_PREFIX}${slideId}`;
      await this.kv.put(slideKey, JSON.stringify(slide));

      // Create new index
      await this.kv.put(
        `${this.COURSE_SLIDES_PREFIX}${courseId}:${String(newOrder).padStart(6, '0')}`,
        slideId
      );

      slides.push(slide);
    }

    // Update slide order list
    const newSlideOrder = input.slideOrders
      .sort((a, b) => a.newOrder - b.newOrder)
      .map(item => item.slideId);
    await this.setSlideOrder(courseId, newSlideOrder);

    return slides.sort((a, b) => a.order - b.order);
  }

  /**
   * Get slide by course and order position
   */
  async getByCourseAndOrder(courseId: string, order: number): Promise<Slide> {
    const indexKey = `${this.COURSE_SLIDES_PREFIX}${courseId}:${String(order).padStart(6, '0')}`;
    const slideId = await this.kv.get(indexKey);

    if (!slideId) {
      throw new NotFoundError(`Slide at position ${order} not found in course ${courseId}`);
    }

    return this.getById(slideId);
  }

  /**
   * Get total slide count for a course
   */
  async countByCourse(courseId: string): Promise<number> {
    const slideOrder = await this.getSlideOrder(courseId);
    return slideOrder.length;
  }

  /**
   * Duplicate a slide
   */
  async duplicate(slideId: string, newOrder?: number): Promise<Slide> {
    const originalSlide = await this.getById(slideId);
    const duplicateInput: CreateSlideInput = {
      courseId: originalSlide.courseId,
      order: newOrder ?? originalSlide.order + 1,
      title: `${originalSlide.title} (Copy)`,
      content: JSON.parse(JSON.stringify(originalSlide.content)), // Deep copy
      speakerNotes: originalSlide.speakerNotes,
      outlineNodeId: originalSlide.outlineNodeId,
      accessibilityMode: originalSlide.accessibilityMode,
      visualAids: originalSlide.visualAids,
      audioNarration: originalSlide.audioNarration,
      layout: originalSlide.layout,
      theme: originalSlide.theme,
      backgroundColor: originalSlide.backgroundColor,
      generatedBy: 'teacher', // Duplicated slides are considered manually created
    };

    return this.create(duplicateInput);
  }
}