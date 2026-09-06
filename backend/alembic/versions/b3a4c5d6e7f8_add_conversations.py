"""add conversations and conversation_messages

数字人对话持久化：
  - conversations：会话列表（每用户最多 20 个）
  - conversation_messages：消息明细

Revision ID: b3a4c5d6e7f8
Revises: a2f1b3c4d5e6
Create Date: 2026-09-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3a4c5d6e7f8'
down_revision: Union[str, Sequence[str], None] = 'a2f1b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'conversations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('session_id', sa.String(64), nullable=False, index=True),
        sa.Column('title', sa.String(128), server_default='新对话'),
        sa.Column('module', sa.String(64), server_default=''),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'conversation_messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversations.id'), nullable=False, index=True),
        sa.Column('role', sa.String(16), nullable=False),
        sa.Column('text', sa.Text(), server_default=''),
        sa.Column('intent', sa.String(32), server_default='chat'),
        sa.Column('engine', sa.String(32), server_default=''),
        sa.Column('level', sa.String(16), server_default=''),
        sa.Column('risk_score', sa.Integer(), server_default='0'),
        sa.Column('source_count', sa.Integer(), server_default='0'),
        sa.Column('meta_json', sa.Text(), server_default=''),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('conversation_messages')
    op.drop_table('conversations')
