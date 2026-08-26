"""add index on review_items.next_review_at

Revision ID: a1b2c3d4e5f7
Revises: a1b2c3d4e5f6
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        'ix_review_items_next_review_at',
        'review_items',
        ['next_review_at'],
    )


def downgrade():
    op.drop_index('ix_review_items_next_review_at', table_name='review_items')
