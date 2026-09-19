import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { rateLimit } from '../../plugins/ratelimit.js';
import { authGuard } from '../../plugins/authentication.js';

import { Blog } from './blog.entity.js';
import { schemaBlogCreate, schemaBlogFindOne, schemaBlogList, schemaBlogRemove } from './blog.schema.js';

import { createSHA256 } from '../../utils/misc.js';
import { BadRequestResponse } from '../../utils/response.js';

const BLOG_IMAGE_DIRECTORY = join(process.cwd(), 'public', 'image');

function createBlogImagePath(image: Buffer | null, imageType: string | null)
{
    if (!image || !imageType || !imageType.startsWith('image/'))
    {
        return '';
    }

    const extension = imageType.split('/')[1]?.split('+')[0];

    if (!extension)
    {
        return '';
    }

    const fileName = `${ createSHA256(image) }.${ extension }`;
    const diskImagePath = join(BLOG_IMAGE_DIRECTORY, fileName);

    if (!existsSync(diskImagePath))
    {
        mkdirSync(BLOG_IMAGE_DIRECTORY, { recursive: true });

        writeFileSync(diskImagePath, image);
    }

    return `image/${ fileName }`;
}

export function list(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const page = request.getQuery('page').min(1).asNumberDefault(1);
        const limit = request.getQuery('limit').min(1).max(30).asNumberDefault(10);
        const search = request.getQuery('search').max(256).asStringOptional();

        const offset = (page - 1) * limit;

        const queryBuilder = fastify.db.getRepository(Blog).createQueryBuilder('blog');

        if (search)
        {
            queryBuilder.andWhere('(blog.title LIKE :search OR blog.description LIKE :search)', { search: `%${ search }%` });
        }

        const [ item, count ] = await queryBuilder.orderBy('blog.created_at', 'DESC').offset(offset).limit(limit).getManyAndCount();

        reply.send({
            count,
            item: item.map((blog) =>
            {
                const filePath = createBlogImagePath(blog.image, blog.image_type);

                return {
                    id: blog.id,
                    image: filePath,
                    slug: blog.slug,
                    title: blog.title,
                    content: blog.content,
                    description: blog.description,
                    updatedAt: blog.updated_at.toISOString(),
                    createdAt: blog.created_at.toISOString()
                };
            })
        });
    };

    return { schema: schemaBlogList, config: { ...rateLimit('blog-list', 500, 2 * 60 * 1000) }, handler };
}

export function findOne(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const slug = request.getParam('slug').min(1).max(256).asString();

        const blog = await fastify.db.getRepository(Blog).findOneBy({ slug });

        if (!blog)
        {
            throw new BadRequestResponse('BLOG_SLUG_NOT_FOUND');
        }

        const filePath = createBlogImagePath(blog.image, blog.image_type);

        reply.send({
            id: blog.id,
            image: filePath,
            slug: blog.slug,
            title: blog.title,
            content: blog.content,
            description: blog.description,
            updatedAt: blog.updated_at.toISOString(),
            createdAt: blog.created_at.toISOString()
        });
    };

    return { schema: schemaBlogFindOne, config: { ...rateLimit('blog-find-one', 500, 2 * 60 * 1000) }, handler };
}

export function create(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        if (request.account_id > 5)
        {
            throw new BadRequestResponse('BLOG_CREATE_INVALID_REQUEST');
        }

        let slug: string | undefined;
        let image: Buffer | undefined;
        let title: string | undefined;
        let content: string | undefined;
        let language: string | undefined;
        let imageType: string | undefined;
        let description: string | undefined;
        let category: number | undefined;

        for await (const part of request.parts())
        {
            if (part.type === 'file')
            {
                if (!part.mimetype.startsWith('image/'))
                {
                    throw new BadRequestResponse('BLOG_CREATE_IMAGE_INVALID');
                }

                imageType = part.mimetype;

                const chunks: Buffer[] = [];

                for await (const chunk of part.file)
                {
                    chunks.push(chunk as Buffer);
                }

                image = Buffer.concat(chunks);

                if (image.length > 4 * 1024 * 1024)
                {
                    throw new BadRequestResponse('BLOG_CREATE_IMAGE_INVALID');
                }
            }

            if (part.type === 'field')
            {
                if (part.fieldname === 'slug')
                {
                    slug = String(part.value);

                    if (slug.length < 5 || slug.length > 256)
                    {
                        throw new BadRequestResponse('BLOG_CREATE_SLUG_INVALID');
                    }
                }

                if (part.fieldname === 'title')
                {
                    title = String(part.value);

                    if (title.length < 5 || title.length > 256)
                    {
                        throw new BadRequestResponse('BLOG_CREATE_TITLE_INVALID');
                    }
                }

                if (part.fieldname === 'description')
                {
                    description = String(part.value);

                    if (description.length < 5 || description.length > 512)
                    {
                        throw new BadRequestResponse('BLOG_CREATE_DESCRIPTION_INVALID');
                    }
                }

                if (part.fieldname === 'content')
                {
                    content = String(part.value);

                    if (content.length < 5)
                    {
                        throw new BadRequestResponse('BLOG_CREATE_CONTENT_INVALID');
                    }
                }

                if (part.fieldname === 'category')
                {
                    category = Number(part.value);

                    if (category < 1 || category > 5)
                    {
                        throw new BadRequestResponse('BLOG_CREATE_CATEGORY_INVALID');
                    }
                }

                if (part.fieldname === 'language')
                {
                    language = String(part.value);

                    if (language.length < 1 || language.length > 4)
                    {
                        throw new BadRequestResponse('BLOG_CREATE_LANGUAGE_INVALID');
                    }
                }
            }
        }

        if (!image)
        {
            throw new BadRequestResponse('BLOG_CREATE_FIELD_INVALID');
        }

        if (!slug)
        {
            throw new BadRequestResponse('BLOG_CREATE_FIELD_INVALID');
        }

        if (!title)
        {
            throw new BadRequestResponse('BLOG_CREATE_FIELD_INVALID');
        }

        if (!description)
        {
            throw new BadRequestResponse('BLOG_CREATE_FIELD_INVALID');
        }

        if (!content)
        {
            throw new BadRequestResponse('BLOG_CREATE_FIELD_INVALID');
        }

        if (!language)
        {
            throw new BadRequestResponse('BLOG_CREATE_FIELD_INVALID');
        }

        if (!category)
        {
            throw new BadRequestResponse('BLOG_CREATE_FIELD_INVALID');
        }

        if (!imageType)
        {
            throw new BadRequestResponse('BLOG_CREATE_FIELD_INVALID');
        }

        if (await fastify.db.getRepository(Blog).findOneBy({ slug }))
        {
            throw new BadRequestResponse('BLOG_CREATE_SLUG_EXIST');
        }

        await fastify.db.getRepository(Blog).save({ image, slug, title, description, content, language, category, image_type: imageType });

        reply.send();
    };

    return { schema: schemaBlogCreate, config: { ...rateLimit('blog-create', 500, 2 * 60 * 1000), ...authGuard() }, handler };
}

export function remove(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        if (request.account_id > 5)
        {
            throw new BadRequestResponse('BLOG_CREATE_INVALID_REQUEST');
        }

        const slug = request.getBody('slug').min(5).max(256).asString();

        const blog = await fastify.db.getRepository(Blog).findOneBy({ slug });

        if (!blog)
        {
            throw new BadRequestResponse('BLOG_REMOVE_SLUG_NOT_FOUND');
        }

        await fastify.db.getRepository(Blog).remove(blog);

        reply.send();
    };

    return { schema: schemaBlogRemove, config: { ...rateLimit('blog-remove', 500, 2 * 60 * 1000), ...authGuard() }, handler };
}
