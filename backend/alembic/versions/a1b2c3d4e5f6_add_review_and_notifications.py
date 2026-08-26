"""add review_items and notifications

Revision ID: a1b2c3d4e5f6
Revises: 9a1b2c3d4e5f
Create Date: 2026-08-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '9a1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'review_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.String(length=64), nullable=False),
        sa.Column('scene_code', sa.String(length=64), nullable=False),
        sa.Column('qtype', sa.String(length=16), nullable=False),
        sa.Column('question_text', sa.String(length=1024), nullable=False),
        sa.Column('interval_days', sa.Integer(), nullable=False),
        sa.Column('repetitions', sa.Integer(), nullable=False),
        sa.Column('ease', sa.Float(), nullable=False),
        sa.Column('last_reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('next_review_at', sa.DateTime(), nullable=False),
        sa.Column('wrong_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'item_id', 'scene_code', name='uq_review_item'),
    )
    op.create_index('ix_review_items_user_id', 'review_items', ['user_id'])

    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=256), nullable=False),
        sa.Column('content', sa.String(length=1024), nullable=False),
        sa.Column('related_url', sa.String(length=256), nullable=False),
        sa.Column('is_read', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_notifications_user_id', table_name='notifications')
    op.drop_table('notifications')
    op.drop_index('ix_review_items_user_id', table_name='review_items')
    op.drop_table('review_items')
