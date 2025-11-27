import { KvCache } from '@liquidmetal-ai/raindrop-framework';
import {
  Course,
  CreateCourseInput,
  UpdateCourseInput,
  UpdateCourseOutlineInput,
  UpdateCourseSlidesInput,
  UpdateCourseAgentInput,
  CourseStatus,
  AccessibilityMode,
} from '../models/course.model';
import { Timestamp } from '../models/common.model';
import { NotFoundError, ValidationError } from '../utils/errors';


export class CourseRepository {
  public kv: KvCache;
  private readonly COURSE_PREFIX = 'course:';
  private readonly TEACHER_COURSES_PREFIX = 'teacher_courses:';
  private readonly PUBLIC_COURSES_PREFIX = 'public_courses:';
  private readonly STATUS_INDEX_PREFIX = 'course_by_status:';

  constructor(kv: KvCache) {
    this.kv = kv;
  }

  /**
   * Generate a unique course ID
   */
  private generateId(): string {
    return `course_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

   /**
   * Create a new course
   */
  async create(input: CreateCourseInput): Promise<Course> {
    // Validate required fields
    if (!input.knowledgeText || input.knowledgeText.trim().length === 0) {
      throw new ValidationError('Knowledge text is required');
    }
    if (!input.concepts || input.concepts.length === 0) {
      throw new ValidationError('At least one concept is required');
    }

    const now: Timestamp = new Date().toISOString();
    const courseId = this.generateId();

    const course: Course = {
      courseId,
      teacherId: input.teacherId,
      title: input.title,
      description: input.description,
      knowledgeText: input.knowledgeText,
      concepts: input.concepts,
      keywords: input.keywords,
      accessibility: input.accessibility,
      slides: [],
      status: input.isPublic ? 'published' : 'draft',
      isPublic: input.isPublic ?? false,
      totalSlides: 0,
      totalStudents: 0,
      totalSessions: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Store course data
    const courseKey = `${this.COURSE_PREFIX}${courseId}`;
    await this.kv.put(courseKey, JSON.stringify(course));

    // Create indexes
    await this.kv.put(`${this.TEACHER_COURSES_PREFIX}${input.teacherId}:${courseId}`, courseId);
    await this.kv.put(`${this.STATUS_INDEX_PREFIX}${course.status}:${courseId}`, courseId);

    if (course.isPublic) {
      await this.kv.put(`${this.PUBLIC_COURSES_PREFIX}${courseId}`, courseId);
    }

    return course;
  }

  /**
   * Get course by ID
   */
  async getById(courseId: string): Promise<Course> {
    const courseKey = `${this.COURSE_PREFIX}${courseId}`;
    const courseData = await this.kv.get(courseKey);

    if (!courseData) {
      throw new NotFoundError(`Course with ID ${courseId} not found`);
    }

    return JSON.parse(courseData) as Course;
  }

  /**
   * Delete course
   */
  async delete(courseId: string): Promise<void> {
    const course = await this.getById(courseId);

    // Delete course data
    const courseKey = `${this.COURSE_PREFIX}${courseId}`;
    await this.kv.delete(courseKey);

    // Delete indexes
    await this.kv.delete(`${this.TEACHER_COURSES_PREFIX}${course.teacherId}:${courseId}`);
    await this.kv.delete(`${this.STATUS_INDEX_PREFIX}${course.status}:${courseId}`);

    if (course.isPublic) {
      await this.kv.delete(`${this.PUBLIC_COURSES_PREFIX}${courseId}`);
    }
  }

  /**
   * List courses by teacher
   */
  async listByTeacher(teacherId: string, options?: { limit?: number }): Promise<Course[]> {
    const prefix = `${this.TEACHER_COURSES_PREFIX}${teacherId}:`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 100,
    });
    
    const courses: Course[] = [];
    for (const key of result.keys) {
      try {
        const courseId = key.name.split(':').pop() || '';
        const course = await this.getById(courseId);
        courses.push(course);
      } catch (error) {
        console.error(`Error fetching course from key ${key.name}:`, error);
      }
    }

    // Sort by updatedAt descending (most recent first)
    return courses.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

    /**
   * List public courses
   */
  async listPublic(options?: { limit?: number }): Promise<Course[]> {
    const prefix = `${this.PUBLIC_COURSES_PREFIX}`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 100,
    });

    const courses: Course[] = [];
    for (const key of result.keys) {
      try {
        const courseId = key.name.replace(this.PUBLIC_COURSES_PREFIX, '');
        const course = await this.getById(courseId);
        
        // Only include published courses
        if (course.status === 'published') {
          courses.push(course);
        }
      } catch (error) {
        console.error(`Error fetching course from key ${key.name}:`, error);
      }
    }

    // Sort by publishedAt descending (most recent first)
    return courses.sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  /**
   * List courses by status
   */
  async listByStatus(status: CourseStatus, options?: { limit?: number }): Promise<Course[]> {
    const prefix = `${this.STATUS_INDEX_PREFIX}${status}:`;
    const result = await this.kv.list({
      prefix,
      limit: options?.limit || 100,
    });

    const courses: Course[] = [];
    for (const key of result.keys) {
      try {
        const courseId = key.name.split(':').pop() || '';
        const course = await this.getById(courseId);
        courses.push(course);
      } catch (error) {
        console.error(`Error fetching course from key ${key.name}:`, error);
      }
    }

    return courses.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

}